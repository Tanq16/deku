#!/bin/bash

# Create directories
mkdir -p static/fontawesome/css
mkdir -p static/fontawesome/webfonts
mkdir -p static/css
mkdir -p static/fonts
mkdir -p static/js

# Download Tailwind CSS
curl -sL "https://cdn.tailwindcss.com" -o "static/js/tailwindcss.js"

# Download Font Awesome 6.7.2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css -o static/fontawesome/css/all.min.css
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-brands-400.woff2 -o static/fontawesome/webfonts/fa-brands-400.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-regular-400.woff2 -o static/fontawesome/webfonts/fa-regular-400.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-solid-900.woff2 -o static/fontawesome/webfonts/fa-solid-900.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-v4compatibility.woff2 -o static/fontawesome/webfonts/fa-v4compatibility.woff2

# Update CSS to use local webfonts
sed -i.bak 's|https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/|/static/fontawesome/webfonts/|g' static/fontawesome/css/all.min.css
rm static/fontawesome/css/all.min.css.bak

# Download Inter font from Google Fonts
curl -sL "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" -A "Mozilla/5.0" -o static/css/inter.css

# Download font files referenced in the CSS
grep -o "https://fonts.gstatic.com/s/inter/[^)]*" static/css/inter.css | while read -r url; do
  filename=$(basename "$url")
  curl -sL "$url" -o "static/fonts/$filename"
done

# Update font CSS to use local files
sed -i.bak 's|https://fonts.gstatic.com/s/inter/v[0-9]*/|/static/fonts/|g' static/css/inter.css
rm static/css/inter.css.bak

echo "Assets downloaded and configured successfully!"
