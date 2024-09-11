# Changelog

## UNRELEASED

### Fixes

* Fixes SASS warnings.

## Changes

* Update devDependencies.

## 2.4.0 (2024-09-05)

### Adds

* Singletons can now be imported through `contextOperations` since they have no manager modal and thus no `utilityOperation` available.
* Pages can be exported via an Export batch operation.

### Fixes

* Exported related documents now contain the entire document and not only the projected fields. 
* The `related` route also returns the related types of the exported documents related documents.
* Greatly improved performance when imports involve attachments that already exist on the target site.
* Cropped images are imported properly.
* Page tree relationships are maintained.
* In general: many fixes to bring this module up to speed for use cases that involve selecting multiple documents.

## 2.3.0 (2024-08-08)

### Adds

* Add a scrollbar to the duplicate import modal to handle too many duplicates, and fixed the "Type" column to display the correct document type. Thanks to (Borel Kuomo)(https://github.com/borelkoumo) for this contribution.

### Fixes

* Adds a method `checkDuplicates` to pre check for duplicates before importing, allows to insert attachments before documents to avoid them being stripped.
* Uses the new method `simulateRelationshipsFromStorage` from core to simulate relationships on data from DB to be able to pass the convert,
also uses the new option `fetchRelationships: false` on the convert to avoid fetching relationships from the DB.
It prevents issues when a relationship has not been inserted yet.
* Requires a duplicate confirmation for existing singleton documents (including parked pages), keeping their original ID's while importing (if the user chooses to do so).

## 2.2.0 (2024-07-12)

### Adds

* Adds a `preventUpdateAssets` to the module that will not try to update already existing assets on import.

## 2.1.1 (2024-06-21)

### Fixes

* Fix export relationship when an area has grouped widgets. Thanks to Michelin for contributing this fix.

## 2.1.0 (2024-06-12)

### Adds

* Add the possibility to set a **key column** in your import CSV file in order to update existing pieces and pages.  
Thanks to this, this module reaches parity with the deprecated [`@apostrophecms/piece-type-importer`](https://github.com/apostrophecms/piece-type-importer) module.

### Fixes

* We can now import pieces or pages with an import file that contains just the required fields.

## 2.0.0 (2024-05-15)

### Changes

* Corrects documentation of required permissions.

### Adds

* Add CSV format.

### Breaking changes

* This is a new major version, 2.0.0. To update to this version you must edit your `package.json` file and change the dependency to `^2.0.0` or similar.
* The signature of the `output` function from the gzip format has changed. It no longer takes the `apos` instance and now requires a `processAttachments` callback.
* `import` and `overrideDuplicates` functions now require `formatLabel` to be passed in `req`.

## 1.4.1 (2024-03-20)

### Changes

* Documentation updates.

### Fixes

* Fixes imported data with the wrong mode because `req.mode` was always `published`, even for draft documents.

## 1.4.0 (2024-03-12)

### Changes

* Compatible with both Apostrophe 3.x and Apostrophe 4.x (both Vue 2 and Vue 3).

### Fixes

* Bug fix. When a piece or a page is created, published, then unpublished, and subsequently exported and re-imported, the manager modal incorrectly showed no published version. This occurs because the `lastPublishedAt` property of the draft document was set to null upon import, misleading the representation of the document's published state. Now it retains the original document's `lastPublishedAt` value.

## 1.3.0 (2024-02-21)

### Changes

* Requires the create and edit permissions to use the import utility operation

## 1.2.1 (2024-01-24)

### Security

* Fixed a security issue that allowed a correctly crafted
HTTP request to delete arbitrary files and folders, subject to the permissions with which the Node.js
process was run. No user account was required to exploit this issue. All users of this module should immediately run `npm update @apostrophecms/import-export` and deploy the latest version of this module. The module has been carefully audited for similar issues and best practices have been put in place to prevent any similar issue in future.

### Changes

* Prefix routes and events to avoid conflicts with the old [`@apostrophecms/piece-type-importer`](https://github.com/apostrophecms/piece-type-importer) and [`@apostrophecms/piece-type-exporter`](https://github.com/apostrophecms/piece-type-exporter) modules.

## 1.2.0 (2023-11-29)

### Adds

* Import now detects if the locale found in the exported docs is different from the current site one.
If the site has only one locale configured, then the docs are automatically re-written with the site locale.
If the site has multiple locales configured, the user is given the possibility to abort the import or re-write the docs with the site locale.  
Please note that this change is dependent on core changes found in 3.60.0.

### Changes

* Hide "Duplicates Detected." notification.

## 1.1.0 (2023-11-03)

### Adds

* Display more information about duplicated documents.
* Export file name more meaningful, containing project name, module name and current date and time.

### Fixes

* Fix progress bar going over `100%` when importing docs that are archived after being exported.
* Adds missing dependency.

## 1.0.2 (2023-10-13)

### Fixes

* Use `uploadfs.copyOut` to ensure success in more attachment export situations, such as debugging a multisite Assembly project
on a local machine where Chrome considers subdomains of `localhost` to be your machine but Node.js does not.
* Minor refactoring for maintainability and performance.
* Error and warning notifications stay in place until dismissed.

## 1.0.1 (2023-10-12)

### Fixes

Move documentation images to our own hosting.

## 1.0.0 (2023-10-12)

### Adds

Initial release.
