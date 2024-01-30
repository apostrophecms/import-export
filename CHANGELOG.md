# Changelog

## UNRELEASED

* Requires the edit permission to use the import utility operation

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
