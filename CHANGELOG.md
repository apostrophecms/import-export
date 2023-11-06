# Changelog

## UNRELEASED

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
