// Menyalin library JSZip ke www/ supaya app bisa baca .pptx secara offline
const fs = require('fs');
fs.mkdirSync('www/vendor', { recursive: true });
fs.copyFileSync('node_modules/jszip/dist/jszip.min.js', 'www/vendor/jszip.min.js');
console.log('JSZip disalin ke www/vendor');
