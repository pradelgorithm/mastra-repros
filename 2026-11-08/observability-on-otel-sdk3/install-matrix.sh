#!/usr/bin/env bash
# Installs each Mastra package that depends on OpenTelemetry into a fresh npm project that is already on
# OpenTelemetry JS SDK 3 (api 1.10.0, sdk-trace / sdk-logs 3.1.0), and reports what npm does: whether the install
# resolves, and how many copies of the OpenTelemetry API and SDK packages end up in node_modules.
# Exits 1 when any package fails to install or adds a second OpenTelemetry API copy.
set -uo pipefail

APP=(@opentelemetry/api@1.10.0 @opentelemetry/sdk-trace@3.1.0 @opentelemetry/sdk-logs@3.1.0
  @mastra/core@1.82.0 @mastra/observability@1.23.1 zod@4.6.7)
PACKAGES=(@mastra/otel-exporter@1.5.1 @mastra/otel-bridge@1.5.21 @mastra/langfuse@1.6.5
  @mastra/arize@1.3.29 @mastra/arthur@0.4.29 @mastra/laminar@1.3.31)

copies() { # copies <dir> <package> -> "1.10.0x1 1.9.1x2"
  find "$1/node_modules" -path "*node_modules/@opentelemetry/$2/package.json" -print0 2>/dev/null |
    xargs -0 -I{} node -p "require('{}').version" | sort | uniq -c | awk '{printf "%sx%s ", $2, $1}'
}

status=0
work=$(mktemp -d)
for pkg in "${PACKAGES[@]}"; do
  dir="$work/$(echo "$pkg" | tr '/@' '__')"
  mkdir -p "$dir" && cd "$dir" || exit 2
  echo '{"name":"app","private":true,"type":"module"}' > package.json
  if npm i --no-audit --no-fund --save-exact "${APP[@]}" "$pkg" > install.log 2>&1; then
    api=$(copies "$dir" api)
    echo "$pkg: installs | api: ${api}| core: $(copies "$dir" core)| sdk-trace-base: $(copies "$dir" sdk-trace-base)| api-logs: $(copies "$dir" api-logs)"
    [[ $(wc -w <<< "$api") -gt 1 ]] && status=1
  else
    echo "$pkg: npm i FAILS ($(grep -m1 '^npm error code' install.log | sed 's/npm error code //'))"
    grep -m1 -A1 'Could not resolve dependency' install.log | tail -1 | sed 's/^npm error /    /'
    status=1
  fi
done
rm -rf "$work"
exit $status
