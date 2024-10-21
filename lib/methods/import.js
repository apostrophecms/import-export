const { cloneDeep } = require('lodash');
const importPage = require('./import-page.js');

module.exports = self => {
  return {
    async import(req, moduleName) {
      if (!req.user) {
        throw self.apos.error('forbidden');
      }

      const { file } = req.files || {};
      const importDraftsOnly = self.apos.launder.boolean(req.body.importDraftsOnly);
      const overrideLocale = self.apos.launder.boolean(req.body.overrideLocale);
      const formatLabel = self.apos.launder.string(req.body.formatLabel);
      let exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      let format;
      let docs;
      let attachmentsInfo;

      try {
        if (overrideLocale) {
          if (!formatLabel) {
            throw self.apos.error('invalid: no `formatLabel` provided');
          }

          format = Object
            .values(self.formats)
            .find(format => format.label === formatLabel);

          if (!exportPath) {
            throw self.apos.error('invalid: no `exportPath` provided');
          }

          ({ docs, attachmentsInfo = [] } = await format.input(exportPath));

        } else {
          if (!file) {
            throw new Error('invalid: no file provided');
          }

          format = Object
            .values(self.formats)
            .find(format => format.allowedTypes.includes(file.type));

          ({
            docs,
            attachmentsInfo = [],
            exportPath = file.path
          } = await format.input(file.path));

          await self.setExportPathId(exportPath);
        }
      } catch (error) {
        await self.apos.notify(req, 'aposImportExport:importFileError', {
          interpolate: { format: format?.label },
          dismiss: true,
          icon: 'alert-circle-icon',
          type: 'danger'
        });
        throw self.apos.error(error.message);
      }

      const differentDocsLocale = self.getFirstDifferentLocale(req, docs);
      const siteHasMultipleLocales = Object.keys(self.apos.i18n.locales).length > 1;

      if (differentDocsLocale) {
        if (siteHasMultipleLocales && !overrideLocale) {
          // Display confirmation modal to ask the user if he wants to
          // continue the import with the current locale overriding the docs one:
          await self.apos.notify(req, ' ', {
            type: 'warning',
            event: {
              name: 'import-export-import-locale-differs',
              data: {
                moduleName,
                exportPathId: await self.getExportPathId(exportPath),
                formatLabel: format.label,
                importDraftsOnly,
                content: {
                  heading: req.t('aposImportExport:importWithCurrentLocaleHeading'),
                  description: req.t('aposImportExport:importWithCurrentLocaleDescription', {
                    docsLocale: differentDocsLocale,
                    currentLocale: req.locale
                  }),
                  negativeLabel: 'apostrophe:no',
                  affirmativeLabel: 'apostrophe:yes'
                }
              }
            },
            classes: [ 'apos-notification--hidden' ]
          });

          return;
        }

        // Re-write if user decided to continue the import (`overrideLocale` param sent)
        // or if the site has only one locale configured
        self.rewriteDocsWithCurrentLocale(req, docs);
      }

      const total = docs.length + attachmentsInfo.length;

      const {
        reporting, jobId, notificationId
      } = await self.instantiateJob(req, total);

      const failedIds = [];

      await self.checkDocTypes(req, {
        reporting,
        docs,
        failedIds
      });

      const { duplicatedDocs, duplicatedIds } = await self.checkDuplicates(req, {
        reporting,
        docs,
        failedIds
      });

      const importedAttachments = await self.insertAttachments(req, {
        attachmentsInfo,
        reporting,
        duplicatedIds,
        failedIds,
        docIds: new Set(docs.map(({ aposDocId }) => aposDocId))
      });

      await self.insertDocs(req, {
        docs,
        reporting,
        duplicatedIds,
        duplicatedDocs,
        failedIds,
        importDraftsOnly
      });

      if (!duplicatedDocs.length) {
        await reporting.end();

        const notifMsg = `aposImportExport:${failedIds.length ? 'importFailedForSome' : 'importSucceed'}`;

        await self.apos.notify(req, notifMsg, {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: failedIds.length ? 'danger' : 'success',
          event: {
            name: 'import-export-import-ended'
          }
        });

        self.apos.notification
          .dismiss(req, notificationId, 2000)
          .catch(() => {
            // Do nothing because it's not an issue
          });

        await self.remove(exportPath);
        return;
      }

      if (failedIds.length) {
        await self.apos.notify(req, 'aposImportExport:importFailedForSome', {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: 'danger'
        });
      }

      // One call to fix all bookkeeping re: docIds, archivedDocIds, etc.
      await self.apos.attachment.recomputeAllDocReferences();

      const results = {
        importDraftsOnly,
        overrideLocale,
        duplicatedDocs,
        importedAttachments,
        type: moduleName,
        exportPathId: await self.getExportPathId(exportPath),
        jobId,
        notificationId,
        formatLabel: format.label
      };

      // we only care about the event here,
      // to display the duplicated docs modal
      await self.apos.notify(req, ' ', {
        type: 'warning',
        event: {
          name: 'import-export-import-duplicates',
          data: results
        },
        classes: [ 'apos-notification--hidden' ]
      });

      return results;
    },

    async instantiateJob(req, total) {
      const jobManager = self.apos.modules['@apostrophecms/job'];
      const job = await jobManager.start();

      const { noteId } = await self.apos.notify(req, 'aposImportExport:importing', {
        icon: 'database-import-icon',
        type: 'success',
        job: {
          _id: job._id
        },
        return: true
      });

      await jobManager.setTotal(job, total);

      return {
        reporting: {
          success(n) {
            return jobManager.success(job, n);
          },
          failure(n) {
            return jobManager.failure(job, n);
          },
          end(success = true) {
            return jobManager.end(job, success);
          }
        },
        jobId: job._id,
        notificationId: noteId
      };
    },

    getFirstDifferentLocale(req, docs) {
      const doc = docs
        .find(doc => self.isLocaleDifferent(req, doc));

      return doc && self.extractLocale(doc.aposLocale);
    },

    rewriteDocsWithCurrentLocale(req, docs) {
      for (const doc of docs) {
        if (self.isLocaleDifferent(req, doc)) {
          const [ id ] = doc._id.split(':');

          doc._id = [ id, req.locale, doc.aposMode ].join(':');
          doc.aposLocale = [ req.locale, doc.aposMode ].join(':');
        }
      }
    },

    isLocaleDifferent(req, doc) {
      return doc.aposLocale && self.extractLocale(doc.aposLocale) !== req.locale;
    },

    extractLocale(aposLocale) {
      const [ locale ] = aposLocale.split(':');

      return locale;
    },

    async checkDocTypes(req, {
      reporting, docs, failedIds
    }) {
      const checkedTypes = new Set();

      for (const { type, aposDocId } of docs) {
        const manager = self.apos.doc.getManager(type);
        if (!manager) {
          failedIds.push(aposDocId);
          reporting.failure();
          if (!checkedTypes.has(type)) {
            await self.apos.notify(req, 'aposImportExport:typeUnknown', {
              interpolate: { type },
              dismiss: true,
              icon: 'database-import-icon',
              type: 'danger'
            });
          }
        }

        checkedTypes.add(type);
      }
    },

    async checkDuplicates(req, {
      reporting, docs, failedIds
    }) {
      const docIds = [];
      const replaceItems = [];
      const aposLocale = `${req.locale}:draft`;
      const alreadyFailed = [ ...failedIds ];

      for (const {
        type, aposDocId, parkedId, title, updatedAt, aposMode, aposLocale
      } of docs) {
        if (alreadyFailed.includes(aposDocId)) {
          continue;
        }
        if (!self.canImport(req, type)) {
          failedIds.push(aposDocId);
          reporting.failure();
          continue;
        }

        const isSingleton = self.apos.modules[type] &&
          self.apos.modules[type].options.singleton === true;

        // Mark singleton and parked docs as "replace" items.
        // Be sure to always continue the loop to avoid duplicates.
        // If the parked/singleton doc is not found, it should be processed as a
        // regular doc.
        if (isSingleton || parkedId) {
          // TODO: what about singleton with localized = false, we don't have aposMode
          // TODO: do I need that for parked page?
          if (aposMode !== 'draft' || !aposDocId) {
            continue;
          }
        }
        const replaceId = isSingleton
          ? await self.findSingletonAposDocId({
            type,
            aposLocale
          })
          : parkedId
            ? await self.findParkedAposDocId({
              parkedId,
              type,
              aposLocale
            })
            : null;
        if (replaceId) {
          // NOTE: please update duplicatedDocs launder in overrideDuplicates
          replaceItems.push({
            aposDocId,
            title,
            type,
            updatedAt,
            replaceId
          });
          continue;
        }
        if (aposDocId && !docIds.includes(aposDocId)) {
          docIds.push(aposDocId);
        }
      }

      const criteria = {
        $and: [
          { aposDocId: { $in: docIds } },
          {
            $or: [
              { aposLocale: { $exists: false } },
              { aposLocale }
            ]
          }
        ]
      };

      const duplicates = await self.apos.doc.db.distinct('aposDocId', criteria);
      const duplicatedIds = new Set(duplicates);

      const duplicatedDocs = docs
        .filter(doc => duplicatedIds.has(doc.aposDocId) && (!doc.aposMode || doc.aposMode === 'draft'))
        .map(({
          aposDocId, title, type, updatedAt
        }) => ({
          // NOTE: please update duplicatedDocs launder in overrideDuplicates
          aposDocId,
          title,
          type,
          updatedAt
        }));

      // Append the replace items to the duplicate lists, so that we can
      // get confirmation from the user to replace them
      for (const item of replaceItems) {
        duplicatedIds.add(item.aposDocId);
        duplicatedDocs.push(item);
      }

      return {
        duplicatedIds,
        duplicatedDocs
      };
    },

    async insertDocs(req, {
      docs, reporting, duplicatedIds, duplicatedDocs, failedIds, importDraftsOnly
    }) {
      for (const doc of docs) {
        if (duplicatedIds.has(doc.aposDocId) || failedIds.includes(doc.aposDocId)) {
          continue;
        }
        const { updateKey, updateField } = self.getUpdateKey(doc);

        // If an update key is found, we try to update the document.
        // It also means that we are in a "simple" import (CSV or Excel),
        // not in a full import process like Gzip with JSON formats.
        if (updateKey) {
          try {
            await self.insertOrUpdateDocWithKey(req, {
              doc,
              updateKey,
              updateField,
              duplicatedDocs,
              importDraftsOnly
            });
            reporting.success();
          } catch (error) {
            reporting.failure();
            failedIds.push(doc.aposDocId);
            self.apos.util.error(error);
          }

          continue;
        }

        const cloned = cloneDeep(doc);

        try {
          const inserted = await self.insertOrUpdateDoc(req, {
            doc,
            failedIds,
            duplicatedDocs,
            importDraftsOnly
          });
          if (inserted) {
            reporting.success();
          }
        } catch (error) {
          reporting.failure();
          failedIds.push(cloned.aposDocId);
          self.apos.util.error(error);
        }
      }
    },

    async insertOrUpdateDocWithKey(req, {
      doc,
      updateKey,
      updateField,
      duplicatedDocs = [],
      importDraftsOnly
    }) {
      const manager = self.apos.doc.getManager(doc.type);
      if (!self.canImport(req, doc.type)) {
        throw new Error(`Import is disabled for this module: ${doc.type}`);
      }

      if (!doc[updateField]) {
        doc[updateField] = doc[updateKey];
      }

      self.handleRichTextFields(manager, doc);

      if (!doc[updateKey]) {
        return insert();
      }

      const matchingDraftPromise = manager.findForEditing(
        req.clone({ mode: 'draft' }),
        {
          aposMode: 'draft',
          [updateField]: doc[updateKey]
        }).toObject();

      const matchingPublishedPromise = manager.findForEditing(
        req.clone({ mode: 'published' }),
        {
          aposMode: 'published',
          [updateField]: doc[updateKey]
        }).toObject();

      let [ matchingDraft, matchingPublished ] = await Promise.all([
        matchingDraftPromise,
        matchingPublishedPromise
      ]);

      if (!matchingDraft && !matchingPublished) {
        return insert();
      }
      return update();

      async function insert() {
        // Insert as "published" to insert
        // in both draft and published versions:
        const _req = req.clone({ mode: 'published' });

        const type = doc.type;
        const docToInsert = {};

        await manager.convert(_req, doc, docToInsert, {
          presentFieldsOnly: true,
          fetchRelationships: false
        });

        if (importDraftsOnly && (docToInsert.aposMode && docToInsert.aposMode !== 'draft')) {
          return docToInsert;
        }

        if (importDraftsOnly) {
          delete docToInsert.lastPublishedAt;
        }

        if (self.isPage(manager)) {
          // TODO: check if this is still true
          // `convert` sets the type to `@apostrophecms/home-page`,
          // let's set it back to the original type:
          docToInsert.type = type;

          return importPage.insert({
            manager: self.apos.page,
            doc: docToInsert,
            req: _req,
            duplicatedDocs
          });
        }

        return manager.insert(_req, docToInsert, { setModified: false });
      }

      async function update() {
        // Get the corresponding draft or published document.
        // At this point, we know that at least one of them exists.
        if (!matchingDraft) {
          matchingDraft = await manager
            .findForEditing(req.clone({ mode: 'draft' }), {
              aposMode: 'draft',
              aposDocId: matchingPublished.aposDocId
            })
            .toObject();
        }
        if (!matchingPublished) {
          matchingPublished = await manager
            .findForEditing(req.clone({ mode: 'published' }), {
              aposMode: 'published',
              aposDocId: matchingDraft.aposDocId
            })
            .toObject();
        }

        const docsToUpdate = [ matchingDraft, matchingPublished ].filter(Boolean);

        for (const docToUpdate of docsToUpdate) {
          if (importDraftsOnly && (docToUpdate.aposMode && docToUpdate.aposMode !== 'draft')) {
            continue;
          }

          const _req = req.clone({ mode: docToUpdate.aposMode });

          await manager.convert(_req, doc, docToUpdate, {
            presentFieldsOnly: true,
            fetchRelationships: false
          });

          self.isPage(manager)
            ? await importPage.update({
              manager: self.apos.page,
              doc: docToUpdate,
              req: _req,
              duplicatedDocs
            })
            : await manager.update(_req, docToUpdate);
        }

        await self.editDocMongoFields(matchingDraft, {
          $set: {
            modified: !!importDraftsOnly
          }
        });
      }
    },

    getUpdateKey (doc) {
      const [ updateKey, ...rest ] = Object
        .keys(doc)
        .filter(key => key.endsWith(':key'));

      if (rest.length) {
        throw new Error('You can have only one key column for updates.');
      }

      return {
        updateKey,
        updateField: updateKey && updateKey.replace(':key', '')
      };
    },

    // Convert to rich text area if not already an area.
    handleRichTextFields(manager, doc) {
      manager.schema.forEach(field => {
        if (field.options?.importAsRichText && typeof doc[field.name] === 'string') {
          doc[field.name] = self.apos.area.fromRichText(doc[field.name]);
        }
      });
    },

    async insertAttachments(req, {
      attachmentsInfo, reporting, duplicatedIds, failedIds, docIds
    }) {
      const importedAttachments = [];

      for (const attachmentInfo of attachmentsInfo) {
        try {
          await self.insertOrUpdateAttachment(req, {
            attachmentInfo,
            duplicatedIds,
            failedIds,
            docIds
          });
          importedAttachments.push(attachmentInfo.attachment._id);
          reporting.success();
        } catch (err) {
          self.apos.util.error(err);
        }
      }

      return importedAttachments;
    },

    async insertOrUpdateDoc(req, {
      doc, method = 'insert', failedIds = [], duplicatedDocs = [], existingAposDocId, importDraftsOnly
    }) {
      const manager = self.apos.doc.getManager(doc.type);
      if (existingAposDocId) {
        method = 'update';
      }

      // Import can be disable at the page-type level
      if (!self.canImport(req, doc.type)) {
        throw new Error(`Import is disabled for this module: ${doc.type}`);
      }

      // In the case of a "simple" import (CSV or Excel), there are good chances that the
      // `aposMode` property is not set. We set it to `draft` by default.
      if (!doc.aposMode) {
        doc.aposMode = 'draft';
      }

      if (doc.aposMode === 'published') {
        if (failedIds.includes(doc.aposDocId)) {
          throw new Error('Inserting document failed');
        }

        if (manager.options.autopublish === true) {
          return true;
        }
      }

      await self.replaceDocId(doc, existingAposDocId);
      self.handleRichTextFields(manager, doc);

      if (method === 'insert') {
        return insert();
      }
      return update();

      async function insert() {
        const _req = req.clone({ mode: doc.aposMode });
        self.apos.schema.simulateRelationshipsFromStorage(req, doc, manager.schema);

        const type = doc.type;
        const docToInsert = doc;

        await manager.convert(_req, doc, docToInsert, {
          presentFieldsOnly: true,
          fetchRelationships: false
        });

        if (importDraftsOnly && (docToInsert.aposMode && docToInsert.aposMode !== 'draft')) {
          return docToInsert;
        }

        if (importDraftsOnly) {
          delete docToInsert.lastPublishedAt;
        }

        if (self.isPage(manager)) {
          // TODO: check if this is still true
          // `convert` sets the type to `@apostrophecms/home-page`,
          // let's set it back to the original type:
          docToInsert.type = type;

          return importPage.insert({
            manager: self.apos.page,
            doc: docToInsert,
            req: _req,
            duplicatedDocs
          });
        }

        return manager.insert(_req, docToInsert, { setModified: false });
      }

      async function update() {
        const _req = req.clone({ mode: doc.aposMode });
        self.apos.schema.simulateRelationshipsFromStorage(req, doc, manager.schema);
        const docToUpdate = await self.apos.doc.db.findOne({ _id: doc._id });
        if (!docToUpdate) {
          return;
        }
        if (importDraftsOnly && docToUpdate.aposMode && docToUpdate.aposMode !== 'draft') {
          return;
        }
        await manager.convert(_req, doc, docToUpdate, {
          presentFieldsOnly: true,
          fetchRelationships: false
        });
        if (self.isPage(manager)) {
          await importPage.update({
            manager: self.apos.page,
            doc: docToUpdate,
            req: _req,
            duplicatedDocs
          });
        } else {
          await manager.update(_req, docToUpdate);
        }

        await self.editDocMongoFields(docToUpdate, {
          $set: {
            modified: !!importDraftsOnly
          }
        });
      }
    },

    canImport(req, docType) {
      return self.canImportOrExport(req, docType, 'import');
    },

    // `self.apos.page.isPage` does not work here since
    // the slug can be omitted in a CSV or Excel file.
    isPage(manager) {
      return self.apos.instanceOf(manager, '@apostrophecms/page-type') ||
        self.apos.instanceOf(manager, '@apostrophecms/any-page-type');
    },

    editDocMongoFields(doc, criteria) {
      return self.apos.doc.db.updateOne({ _id: doc._id }, criteria);
    },

    async insertOrUpdateAttachment(req, {
      attachmentInfo: { attachment, file },
      duplicatedIds = new Set(),
      failedIds = [],
      docIds
    }) {
      // TODO: Find a more efficient way to compare only relatedIds
      // (we need to find a way to keep autopublish published IDs in that case)
      if (docIds && (duplicatedIds.size || failedIds.length)) {
        const relatedIds = attachment.docIds
          .reduce((acc, id) => {
            const aposId = id.replace(/:.+$/, '');
            return [
              ...acc,
              ...acc.includes(aposId) || !docIds.has(aposId) ? [] : [ aposId ]
            ];
          }, []);

        if (relatedIds.every((id) => duplicatedIds.has(id) || failedIds.includes(id))) {
          throw self.apos.error(`Related documents have not been imported for attachment: ${attachment._id}`);
        }
      }

      const existing = await self.apos.attachment.db.findOne({
        _id: attachment._id
      });
      if (!existing) {
        await self.apos.attachment.insert(
          req,
          file,
          { attachmentId: attachment._id }
        );
        for (const crop of (attachment.crops || [])) {
          await self.apos.attachment.crop(req, attachment._id, crop);
        }
      } else {
        // Same _id === same original file, same scaled versions, etc.
        // The only differences will be in the crops and the
        // docIds etc. We will take care of docIds in one shot later via
        // recomputeAllDocReferences
        //
        // Perform any crops not found in the existing attachment
        for (const crop of attachment.crops || []) {
          if (!(existing.crops || []).find(c => JSON.stringify(c) === JSON.stringify(crop))) {
            await self.apos.attachment.crop(req, attachment._id, crop);
          }
        }
      }
    },

    async overrideDuplicates(req) {
      const importDraftsOnly = self.apos.launder.boolean(req.body.importDraftsOnly);
      const overrideLocale = self.apos.launder.boolean(req.body.overrideLocale);
      const exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      const docIds = self.apos.launder.strings(req.body.docIds);
      const duplicatedDocs = req.body.duplicatedDocs?.map(duplicatedDoc => {
        return {
          aposDocId: self.apos.launder.string(duplicatedDoc.aposDocId),
          title: self.apos.launder.string(duplicatedDoc.title),
          type: self.apos.launder.string(duplicatedDoc.type),
          updatedAt: self.apos.launder.date(duplicatedDoc.updatedAt),
          replaceId: self.apos.launder.string(duplicatedDoc.replaceId)
        };
      }) ?? [];
      const jobId = self.apos.launder.string(req.body.jobId);
      const importedAttachments = self.apos.launder.strings(req.body.importedAttachments);
      const formatLabel = self.apos.launder.string(req.body.formatLabel);
      const failedIds = [];
      const replaceDocIdPairs = [];

      const jobManager = self.apos.modules['@apostrophecms/job'];
      const job = await jobManager.db.findOne({ _id: jobId });

      const format = Object
        .values(self.formats)
        .find(format => format.label === formatLabel);

      if (!format) {
        jobManager.failure(job);
        throw self.apos.error(`invalid format "${formatLabel}"`);
      }

      const { docs, attachmentsInfo = [] } = await format.input(exportPath);

      const filterDocs = docs.filter(doc => docIds.includes(doc.aposDocId));

      const differentDocsLocale = self.getFirstDifferentLocale(req, filterDocs);
      const siteHasMultipleLocales = Object.keys(self.apos.i18n.locales).length > 1;

      // Re-write locale if `overrideLocale` param is passed-on from the import process
      // (i.e if the user chose "Yes")
      // or re-write locale automatically on a single-locale site
      if (differentDocsLocale && (!siteHasMultipleLocales || overrideLocale)) {
        self.rewriteDocsWithCurrentLocale(req, filterDocs);
      }

      for (const doc of filterDocs) {
        try {
          if (attachmentsInfo.length) {
            const attachmentsIds = [];
            await self.getRelatedDocsFromSchema(req, {
              doc,
              schema: self.apos.modules[doc.type].schema,
              type: 'attachment',
              storedData: attachmentsIds
            });

            for (const id of attachmentsIds) {
              if (importedAttachments.includes(id)) {
                continue;
              }
              const attachmentInfo = attachmentsInfo
                .find(({ attachment }) => attachment._id === id);

              try {
                await self.insertOrUpdateAttachment(req, { attachmentInfo });
                jobManager.success(job);
                importedAttachments.push(id);
              } catch (err) {
                jobManager.failure(job);
              }
            }
          }

          const [ existingAposDocId ] = duplicatedDocs
            .filter(({ aposDocId }) => aposDocId === doc.aposDocId)
            .map(({ replaceId }) => replaceId || null);
          await self.insertOrUpdateDoc(req, {
            doc,
            method: 'update',
            failedIds,
            existingAposDocId,
            duplicatedDocs,
            importDraftsOnly
          });

          if (existingAposDocId) {
            replaceDocIdPairs.push([
              doc._id,
              `${existingAposDocId}:${doc.aposLocale}`
            ]);
          }

          jobManager.success(job);
        } catch (err) {
          jobManager.failure(job);
          failedIds.push(doc.aposDocId);
          self.apos.util.error(err);
          continue;
        }
      }

      if (replaceDocIdPairs.length) {
        await self.apos.doc.changeDocIds(replaceDocIdPairs, { skipReplace: true });
      }

      if (failedIds.length) {
        await self.apos.notify(req, 'aposImportExport:importFailedForSome', {
          interpolate: {
            count: failedIds.length
          },
          dismiss: true,
          icon: 'database-import-icon',
          type: 'danger'
        });
      }
    },

    async setExportPathId(path) {
      const id = self.apos.util.generateId();
      await self.apos.cache.set('exportPaths', id, path, 86400);
      await self.apos.cache.set('exportPathIds', path, id, 86400);
      return id;
    },

    async getExportPathById(id) {
      return self.apos.cache.get('exportPaths', id);
    },

    async getExportPathId(path) {
      return self.apos.cache.get('exportPathIds', path);
    },

    async cleanExport(req) {
      console.info('[import] cleaning export...');
      const exportPath = await self.getExportPathById(self.apos.launder.string(req.body.exportPathId));
      if (!exportPath) {
        throw self.apos.error.invalid('no such export path');
      }
      const jobId = self.apos.launder.string(req.body.jobId);
      const notificationId = self.apos.launder.string(req.body.notificationId);

      if (jobId) {
        const jobManager = self.apos.modules['@apostrophecms/job'];
        const job = await jobManager.db.findOne({ _id: jobId });
        jobManager.end(job, true);
      }
      if (notificationId) {
        self.apos.notification
          .dismiss(req, notificationId, 2000)
          .catch(() => {
            // Do nothing because it's not an issue
          });
      }

      await self.remove(exportPath);
    },

    // This methods expects a singleton type and it doesn't
    // perform any related checks. It's up to the caller to
    // make sure the singleton exists.
    // Singletons are pieces having option `singleton: true`.
    async findSingletonAposDocId({ type, aposLocale }) {
      const singleton = await self.apos.doc.db.findOne({
        $and: [
          { type },
          {
            $or: [
              { aposLocale: { $exists: false } },
              { aposLocale }
            ]
          }
        ]
      }, {
        projection: { aposDocId: 1 }
      });

      if (singleton && singleton.aposDocId) {
        return singleton.aposDocId;
      }

      return null;
    },
    async findParkedAposDocId({
      parkedId, type, aposLocale
    }) {
      const parked = await self.apos.doc.db.findOne({
        $and: [
          {
            parkedId,
            type
          },
          {
            $or: [
              { aposLocale: { $exists: false } },
              { aposLocale }
            ]
          }
        ]
      }, {
        projection: { aposDocId: 1 }
      });

      if (parked && parked.aposDocId) {
        return parked.aposDocId;
      }

      return null;
    },

    // Replace ID fields of imported document with a new ID,
    // usually the ID of an existing document in the database.
    // This methods shouldn't be "perfect" as `apos.doc.changeDocIds`
    // will be called at the end of the import process to replace
    // all the IDs and update relationships.
    async replaceDocId(doc, replaceId) {
      if (!replaceId) {
        return doc;
      }
      doc._id = `${replaceId}:${doc.aposLocale}`;
      doc.aposDocId = replaceId;

      const manager = self.apos.doc.getManager(doc.type);
      if (!manager || !self.isPage(manager)) {
        return doc;
      }

      const existing = await self.apos.doc.db.findOne({
        _id: doc._id
      }, {
        projection: {
          path: 1,
          rank: 1,
          level: 1
        }
      });
      if (existing) {
        doc.path = existing.path;
        doc.rank = existing.rank;
        doc.level = existing.level;
      }

      return doc;
    }
  };
};
