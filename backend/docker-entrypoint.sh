#!/bin/sh
set -e

if [ -n "$COOKIES_CONTENT" ]; then
    mkdir -p /cookies

    # Write Netscape format for reference
    printf '%s' "$COOKIES_CONTENT" > /tmp/raw_cookies.txt

    # Convert to Cobalt JSON format
    COOKIE_STR=$(grep '\.youtube\.com' /tmp/raw_cookies.txt | awk '{print $6"="$7}' | tr '\n' ';' | sed 's/;$//')

    printf '{"youtube": "%s"}' "$COOKIE_STR" > /cookies/cookies.json
    export COOKIE_PATH=/cookies/cookies.json
    echo "Cookie file written in JSON format."
fi

cd /cobalt
exec node src/cobalt.js
