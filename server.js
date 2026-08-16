// server.js - Serveur HTTP avec types MIME corrects
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8080;

// Types MIME complets
const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',    // ← Important pour les modules
    '.mjs': 'application/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.txt': 'text/plain'
};

const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url, 'http://localhost');
    let filePath = '.' + requestUrl.pathname;
    if (filePath === './') {
        filePath = './test.html';
    }

    if (filePath === './favicon.ico') {
        res.writeHead(204);
        res.end();
        return;
    }

    const extname = String(path.extname(filePath)).toLowerCase();
    const contentType = mimeTypes[extname] || 'application/octet-stream';

    fs.readFile(filePath, (error, content) => {
        if (error) {
            if (error.code === 'ENOENT') {
                res.writeHead(404);
                res.end(`Fichier non trouvé: ${req.url}`);
            } else {
                res.writeHead(500);
                res.end(`Erreur serveur: ${error.code}`);
            }
        } else {
            // Ajouter les headers CORS pour éviter les problèmes
            res.writeHead(200, { 
                'Content-Type': contentType,
                'Access-Control-Allow-Origin': '*'
            });
            res.end(content, 'utf-8');
        }
    });
});

server.listen(PORT, () => {
    console.log(`✅ Serveur démarré sur http://localhost:${PORT}`);
    console.log(`📁 Dossier: ${__dirname}`);
    console.log(`\n🔗 Ouvrez votre navigateur à l'adresse: http://localhost:${PORT}`);
});