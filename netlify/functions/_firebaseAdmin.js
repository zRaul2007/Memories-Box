// Inicializa o Firebase Admin SDK uma única vez (Netlify pode reaproveitar a
// mesma instância da function entre invocações — reinicializar dava erro).
// Usando a API modular (getApps/initializeApp/cert) em vez do objeto
// namespaced antigo (admin.apps, admin.initializeApp) — em versões recentes
// do firebase-admin o objeto default de require('firebase-admin') não traz
// mais ".apps" pronto, e isso quebrava com "Cannot read properties of
// undefined (reading 'length')".
const { initializeApp, getApps, cert } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getDatabase } = require('firebase-admin/database');

if (!getApps().length) {
    // DEBUG TEMPORÁRIO — apaga essas linhas depois de descobrir o problema.
    console.log('DEBUG env vars recebidas:', {
        FIREBASE_PROJECT_ID: process.env.FIREBASE_PROJECT_ID || '(vazio)',
        FIREBASE_CLIENT_EMAIL: process.env.FIREBASE_CLIENT_EMAIL ? '(presente)' : '(vazio)',
        FIREBASE_PRIVATE_KEY: process.env.FIREBASE_PRIVATE_KEY ? '(presente)' : '(vazio)',
        FIREBASE_DATABASE_URL: process.env.FIREBASE_DATABASE_URL || '(vazio)',
    });

    initializeApp({
        credential: cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            // No painel da Netlify, quebras de linha em env vars chegam como
            // "\n" literal (string), não como quebra de linha de verdade —
            // por isso o replace abaixo é necessário.
            privateKey: (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
        }),
        databaseURL: process.env.FIREBASE_DATABASE_URL,
    });
}

module.exports = { getAuth, getDatabase };