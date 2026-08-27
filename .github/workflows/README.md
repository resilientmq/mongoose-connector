# GitHub Actions workflows

## `ci.yml`

Validates Node.js 20.19, 22, and 24; type checking; unit tests; enforced
coverage; npm audit; real MongoDB 8 integration tests with Mongoose 8 and 9;
build output; normalized package metadata; and publication tarball contents.

## `release.yml`

Validates SemVer tags and publishes with npm trusted publishing. Configure this
package on npm with organization `resilientmq`, repository
`mongoose-connector`, workflow `release.yml`, environment `npm`, and allowed
action `npm publish`.

The workflow requires `id-token: write` and uses no `NPM_TOKEN`. It fails when
the tag, package version, changelog, normalized metadata, tests, audit, build, or
registry availability check is invalid. An existing version is an error rather
than a successful skipped publication.
