// firebase-messaging-sw.js
// Service Worker do Firebase Cloud Messaging — roda em segundo plano, mesmo
// com o site fechado, pra receber e mostrar notificações push.
// Precisa ficar na RAIZ do site (não numa subpasta), senão o escopo não cobre
// as páginas do app.

importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.1/firebase-messaging-compat.js');

// Mesmos valores públicos do firebaseConfig que já estão no main.js — são só
// identificadores do projeto, não segredos (a segurança real é feita pelas
// Regras do Firebase, não por esconder essa config).
firebase.initializeApp({
    apiKey: "AIzaSyB3sZlPNIyipFlyu2yIqg-nIg5GU3WoduA",
    authDomain: "notebook-twin.firebaseapp.com",
    databaseURL: "https://notebook-twin-default-rtdb.firebaseio.com",
    projectId: "notebook-twin",
    storageBucket: "notebook-twin.firebasestorage.app",
    messagingSenderId: "346603016037",
    appId: "1:346603016037:web:e51714b16fa7342fc49b8c"
});

const messaging = firebase.messaging();

// Dispara quando chega uma notificação com o site fechado ou em segundo plano.
// O disparo em si (quem manda e o que manda) é a próxima etapa — aqui é só o
// "recebimento" genérico.
messaging.onBackgroundMessage((payload) => {
    const titulo = payload.notification?.title || 'Memories Box';
    const opcoes = {
        body: payload.notification?.body || '',
        icon: payload.notification?.icon || '/icone-192.png', // ajuste pro ícone real do seu manifest.json
        badge: '/icone-192.png',
        data: payload.data || {}
    };
    self.registration.showNotification(titulo, opcoes);
});

// Clique na notificação: foca uma aba já aberta do app, ou abre uma nova
self.addEventListener('notificationclick', (evento) => {
    evento.notification.close();
    evento.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((listaClients) => {
            for (const cliente of listaClients) {
                if (cliente.url.includes(self.location.origin) && 'focus' in cliente) {
                    return cliente.focus();
                }
            }
            if (clients.openWindow) return clients.openWindow('/');
        })
    );
});