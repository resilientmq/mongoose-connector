# Security policy

Report suspected vulnerabilities privately through GitHub Security Advisories
for `resilientmq/mongoose-connector`. Do not open a public issue containing an
exploit, credential, connection string, or private deployment detail.

Supported release lines receive security fixes according to their matching
`@resilientmq/core` major. Applications should use the newest patch available
within their connector major and keep MongoDB authentication, TLS, network
access, and least-privilege roles configured outside this package.

Never commit MongoDB URIs, RabbitMQ credentials, npm tokens, or generated secret
files. Release automation uses npm trusted publishing through GitHub OIDC and
must not use a long-lived `NPM_TOKEN`.
