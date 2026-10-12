import type { ProduceContributions } from "../contributions.js"
import { assertHttpsOrigin, containerIdentity, SERVICE_PORT } from "./docker.js"

/**
 * HTTPD owns the concrete gateway server: public health, static files, and
 * the API proxy. Docker owns the image and Compose service that run it.
 */
export const contributions: ProduceContributions = (selection, facts) => {
  if (!selection.runtimes.includes("gateway")) return []
  if (!selection.runtimes.includes("server")) return []
  const identity = containerIdentity(facts.root.name)
  assertHttpsOrigin(identity.serviceUrlName, identity.serviceUrl)
  return [
    {
      id: "httpd:file:gateway/httpd.conf",
      source: "preset:httpd",
      kind: "whole-file",
      path: "gateway/httpd.conf",
      contents: httpdConf(identity),
    },
    {
      id: "httpd:file:gateway/public/index.html",
      source: "preset:httpd",
      kind: "whole-file",
      path: "gateway/public/index.html",
      contents: INDEX_HTML,
    },
  ]
}

function httpdConf(identity: ReturnType<typeof containerIdentity>): string {
  const api = `http://${identity.serviceName}:${SERVICE_PORT}`
  return `ServerRoot "/usr/local/apache2"
Listen 80
Listen 443

LoadModule mpm_event_module modules/mod_mpm_event.so
LoadModule authn_core_module modules/mod_authn_core.so
LoadModule authz_core_module modules/mod_authz_core.so
LoadModule reqtimeout_module modules/mod_reqtimeout.so
LoadModule mime_module modules/mod_mime.so
LoadModule log_config_module modules/mod_log_config.so
LoadModule env_module modules/mod_env.so
LoadModule headers_module modules/mod_headers.so
LoadModule setenvif_module modules/mod_setenvif.so
LoadModule unixd_module modules/mod_unixd.so
LoadModule dir_module modules/mod_dir.so
LoadModule alias_module modules/mod_alias.so
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule proxy_module modules/mod_proxy.so
LoadModule proxy_http_module modules/mod_proxy_http.so
LoadModule ssl_module modules/mod_ssl.so

User www-data
Group www-data
ServerName ${identity.gatewayAlias}

<Directory />
    AllowOverride none
    Require all denied
</Directory>

DocumentRoot /srv/homepage

<Directory "/srv/homepage">
    Options FollowSymLinks
    AllowOverride None
    Require all granted
</Directory>

<IfModule dir_module>
    DirectoryIndex index.html
</IfModule>

<Files ".ht*">
    Require all denied
</Files>

ErrorLog /proc/self/fd/2
LogLevel warn

<IfModule log_config_module>
    LogFormat "%h %l %u %t \\"%r\\" %>s %b" common
    CustomLog /proc/self/fd/1 common
</IfModule>

<IfModule mime_module>
    TypesConfig conf/mime.types
</IfModule>

<IfModule headers_module>
    RequestHeader unset Proxy early
</IfModule>

<VirtualHost *:80>
    RewriteEngine On
    RewriteRule ^ https://%{HTTP_HOST}%{REQUEST_URI} [R=301,L]
</VirtualHost>

<VirtualHost *:443>
    DocumentRoot /srv/homepage
    SSLEngine on
    SSLCertificateFile "/etc/apache2/ssl/local.multiplayerdb.dev.crt"
    SSLCertificateKeyFile "/etc/apache2/ssl/local.multiplayerdb.dev.key"

    <Directory "/srv/homepage">
        Options FollowSymLinks
        AllowOverride None
        Require all granted
    </Directory>

    ProxyPass /api ${api}/api
    ProxyPassReverse /api ${api}/api
    ProxyPass /healthcheck ${api}/healthcheck
    ProxyPassReverse /healthcheck ${api}/healthcheck
</VirtualHost>
`
}

const INDEX_HTML = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Package service</title>
  </head>
  <body>
    <p>Package service</p>
  </body>
</html>
`
