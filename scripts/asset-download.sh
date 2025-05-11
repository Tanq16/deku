#!/bin/bash

# Create directories
mkdir -p static/webfonts

# Download Font Awesome 6.7.2
echo "Downloading Font Awesome..."
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/css/all.min.css -o static/fontawesome.min.css
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-brands-400.woff2 -o static/webfonts/fa-brands-400.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-regular-400.woff2 -o static/webfonts/fa-regular-400.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-solid-900.woff2 -o static/webfonts/fa-solid-900.woff2
curl -sL https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/fa-v4compatibility.woff2 -o static/webfonts/fa-v4compatibility.woff2

# Update CSS to use local webfonts
sed -i.bak 's|https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.7.2/webfonts/|/static/webfonts/|g' static/fontawesome.min.css
rm static/fontawesome.min.css.bak

echo "Assets downloaded and configured successfully!"
