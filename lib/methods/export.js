const fs = require('fs');
const path = require('path');

module.exports = (self) => {
  return {
    exportCleanup(file) {
      try {
        fs.unlinkSync(file);
      } catch (e) {
        self.apos.util.error(e);
      }
    },
    async exportWriteBatch (req, out, _ids, lastId = '', reporting, options) {
      let batch;

      try {
        batch = await self.find(req, {
          $and: [
            {
              _id: { $gt: lastId }
            },
            {
              _id: { $in: _ids }
            }
          ]
        })
          .sort({ _id: 1 })
          .limit(options.batchSize || 100).toArray();
      } catch (error) {
        self.apos.util.error(error);
        throw self.apos.error('notfound');
      }

      if (!batch.length) {
        return null;
      }

      lastId = batch[batch.length - 1]._id;

      for (const piece of batch) {
        try {
          const record = await self.exportRecord(req, piece);

          reporting.success();
          out.write(record);
        } catch (error) {
          self.apos.util.error('exportRecord error', piece._id, error);
          reporting.failure();
        }
      }

      return lastId;
    },
    async exportRun (req, reporting, options) {
      if (typeof reporting.setTotal === 'function') {
        reporting.setTotal(req.body._ids.length);
      }

      const extension = options.extension;
      const format = options.format;

      const filename = `${self.apos.util.generateId()}-export.${extension}`;
      const filepath = path.join(self.apos.attachment.uploadfs.getTempPath(), filename);

      let out;
      let data;
      let reported = false;

      if (format.output.length === 1) {
        // Now kick off the stream processing
        out = format.output(filepath);
      } else {
        // Create a simple writable stream that just buffers up the objects. Allows the simpler type of output function to drive the same methods that otherwise write to an output stream.
        data = [];
        out = {
          write: function (o) {
            data.push(o);
          },
          end: function () {
            return format.output(filepath, data, function (err) {
              if (err) {
                out.emit('error', err);
              } else {
                out.emit('finish');
              }
            });
          },
          on: function (name, fn) {
            out.listeners[name] = out.listeners[name] || [];
            out.listeners[name].push(fn);
          },
          emit: function (name, value) {
            (out.listeners[name] || []).forEach(function (fn) {
              fn(value);
            });
          },
          listeners: {}
        };
      }

      const result = new Promise((resolve, reject) => {
        out.on('error', function (err) {
          if (!reported) {
            reported = true;
            self.exportCleanup(filepath);
            self.apos.util.error(err);

            return reject(self.apos.error('error'));
          }
        });

        out.on('finish', async function () {
          if (!reported) {
            reported = true;
            // Must copy it to uploadfs, the server that created it
            // and the server that delivers it might be different
            const filename = `${self.apos.util.generateId()}.${extension}`;
            const downloadPath = path.join('/exports', filename);

            const copyIn = require('util').promisify(self.apos.attachment.uploadfs.copyIn);

            try {
              await copyIn(filepath, downloadPath);
            } catch (error) {
              self.exportCleanup(filepath);
              return reject(error);
            }

            const downloadUrl = self.apos.attachment.uploadfs.getUrl() + downloadPath;

            reporting.setResults({
              url: downloadUrl
            });

            await self.apos.notification.trigger(req, 'Exported {{ count }} {{ type }}.', {
              interpolate: {
                count: req.body._ids.length,
                type: req.body.type || req.t('apostrophe:document')
              },
              dismiss: true,
              icon: 'database-export-icon',
              type: 'success',
              event: {
                name: 'export-download',
                data: {
                  url: downloadUrl
                }
              }
            });

            self.exportCleanup(filepath);

            const expiration = self.options.export && self.options.export.expiration;

            // Report is available for one hour
            setTimeout(function () {
              self.apos.attachment.uploadfs.remove(downloadPath, function (err) {
                if (err) {
                  self.apos.util.error(err);
                }
              });
            }, expiration || 1000 * 60 * 60);

            return resolve(null);
          }
        });

      });

      let lastId = '';
      const _ids = req.body._ids.map(id => id.replace(':draft', ':published'));
      const pubReq = req.clone({ mode: 'published' });

      do {
        lastId = await self.exportWriteBatch(pubReq, out, _ids, lastId, reporting, {
          ...options
        });
      } while (lastId);

      self.closeExportStream(out);

      return result;
    },
    async exportRecord (req, piece) {
      const schema = self.schema;
      const record = {};
      // Schemas don't have built-in exporters, for strings or otherwise.
      // Follow a format that reverses well if fed back to our importer
      // (although the importer can't accept an attachment via URL yet,
      // that is a plausible upgrade). Export schema fields only,
      // plus _id.
      record._id = piece._id;

      schema.forEach(function (field) {
        if (self.options.export.omitFields && self.options.export.omitFields.includes(field.name)) {
          return;
        }
        let value = piece[field.name];
        if ((typeof value) === 'object') {
          if (field.type === 'relationship') {
            value = (value || []).map(function (item) {
              return item.title;
            }).join(',');
          } else if (field.type === 'attachment') {
            value = self.apos.attachment.url(value);
          } else if ((field.type === 'area')) {
            if (field.options && field.options.exportPlainText) {
              value = self.apos.area.plaintext(value);
            } else {
              value = self.apos.area.richText(value);
            }
          } else {
            value = '';
          }
        } else {
          if (value) {
            value = value.toString();
          }
        }
        record[field.name] = value;
      });

      await self.beforeExport(req, piece, record);

      return record;
    },
    closeExportStream(stream) {
      stream.end();
    },
    beforeExport (req, piece, record) {
      return record;
    }
  };
};
