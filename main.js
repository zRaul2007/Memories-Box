import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-app.js";
import { getDatabase, ref, onValue, set, push, update, remove, get, onDisconnect } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-database.js";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/10.8.1/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyB3sZlPNIyipFlyu2yIqg-nIg5GU3WoduA",
    authDomain: "notebook-twin.firebaseapp.com",
    databaseURL: "https://notebook-twin-default-rtdb.firebaseio.com",
    projectId: "notebook-twin",
    storageBucket: "notebook-twin.firebasestorage.app",
    messagingSenderId: "346603016037",
    appId: "1:346603016037:web:e51714b16fa7342fc49b8c",
    measurementId: "G-RQXZN0T49X"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const AVATAR_PADRAO = "https://ui-avatars.com/api/?name=Usuario&background=cccccc&color=fff";

let usuarioAtual = null; let nomeExibicaoAtual = "Usuário"; let cadernoAtualId = null;
let minhaPermissaoAtual = "leitor"; let souDonoDoCadernoAtual = false; let souAdminOuDono = false;

let paginaAtual = 1; let totalPaginas = 1;
let usuariosDb = {};
onValue(ref(database, 'usuarios'), (snapshot) => { usuariosDb = snapshot.val() || {}; });
let camadaGlobalZIndex = 50;
let tarefaSendoEditadaId = null; let tarefaSendoApagadaId = null;
let escutaAnotacoes, escutaTarefas, escutaStickers, escutaDesenhos, escutaTotalPaginas, escutaPresenca, escutaAmei;
let refMinhaPresenca = null;
let modoLeituraAtivo = false; // Controle estilo Obsidian para evitar toques acidentais no mobile durante a leitura

const telaLogin = document.getElementById('telaLogin');
const telaDashboard = document.getElementById('telaDashboard');
const telaApp = document.getElementById('telaApp');
const caixaDeTexto = document.getElementById('caixaDeTexto');
const folhaA4Wrapper = document.getElementById('folhaA4Wrapper');
const areaStickers = document.getElementById('areaStickers');
const canvasDesenho = document.getElementById('camadaDesenho');
const ctxDesenho = canvasDesenho ? canvasDesenho.getContext('2d') : null;


// ==========================================
// 1. MOTOR DE SEGURANÇA (ANTI-XSS)
// ==========================================
function sanitizarHTML(htmlBruto) {
    if (!htmlBruto) return "";
    try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(htmlBruto, 'text/html');

        // Remove tags perigosas
        const tagsProibidas = doc.querySelectorAll('script, iframe, object, embed, form');
        tagsProibidas.forEach(tag => tag.remove());

        // Remove atributos on... (ex: onclick, onerror) de TODOS os elementos
        const todosElementos = doc.querySelectorAll('*');
        todosElementos.forEach(el => {
            Array.from(el.attributes).forEach(attr => {
                if (attr.name.toLowerCase().startsWith('on')) {
                    el.removeAttribute(attr.name);
                }
            });
        });
        return doc.body.innerHTML;
    } catch (e) {
        console.error("Erro ao sanitizar HTML:", e);
        return htmlBruto; // Fallback
    }
}

// --- NOVO: SISTEMA DE ALERTAS (TOAST) ---
window.mostrarToast = (mensagem, icone = '✅') => {
    let container = document.getElementById('toastContainer');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toastContainer';
        container.className = 'toast-container';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.innerHTML = `<span style="font-size: 18px;">${icone}</span> <span>${mensagem}</span>`;
    container.appendChild(toast);

    // Animação de entrada
    setTimeout(() => toast.classList.add('show'), 10);
    // Animação de saída e destruição
    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// --- SISTEMA DE NOTIFICAÇÕES INTELIGENTES E PWA ---
let meuUltimoUpdate = 0; // Flag anti-spam

// Pede permissão ao navegador
if (Notification.permission === 'default') {
    Notification.requestPermission();
}

// Dispara só se a pessoa estiver FORA da aba e não for ela que editou!
const notificarNovoConteudo = (mensagem) => {
    if (document.hidden && Notification.permission === 'granted' && (Date.now() - meuUltimoUpdate > 5000)) {
        new Notification("Memories Box 📓", { body: mensagem, icon: 'https://cdn-icons-png.flaticon.com/512/3238/3238015.png' });
    }
};

// Avisa o Anti-Spam sempre que VOCÊ salva algo
const salvarTextoFirebaseBase = salvarTextoFirebase; // Guarda a original
window.salvarTextoFirebase = function () {
    meuUltimoUpdate = Date.now();
    salvarTextoFirebaseBase();
};

// ==========================================
// EFEITOS SONOROS (Motor de UX de Áudio)
// ==========================================
const sonsApp = {
    pagina: new Audio('https://cdn.pixabay.com/audio/2022/03/10/audio_c8c8a73467.mp3'), // Som de folha virando
    camera: new Audio('https://cdn.pixabay.com/audio/2021/08/04/audio_34b2203ddb.mp3')  // Som de câmera analógica
};
// Deixando o volume agradável e não invasivo
sonsApp.pagina.volume = 0.4;
sonsApp.camera.volume = 0.2;

const dispararSom = (tipo) => {
    try {
        // Zera o tempo para permitir toques rápidos em sequência
        sonsApp[tipo].currentTime = 0;
        // O .catch() evita o erro clássico "DOMException: play() failed" se o navegador bloquear o autoplay antes da interação do usuário
        sonsApp[tipo].play().catch(() => { });
    } catch (e) {
        console.warn("Áudio ignorado:", e);
    }
};

// ==========================================
// 2. MODO ESCURO, LANTERNA E EFEITOS LO-FI
// ==========================================
// Áudio relaxante contínuo para o Modo Foco
const audioLanterna = new Audio('https://cdn.pixabay.com/audio/2022/05/27/audio_1808fbf07a.mp3'); // Lo-Fi Beats
audioLanterna.loop = true;
audioLanterna.volume = 0.15; // Bem baixinho e relaxante

document.getElementById('toggleModoLanterna')?.addEventListener('change', (e) => {
    if (e.target.checked) {
        document.body.classList.add('modo-lanterna');
        audioLanterna.play().catch(() => { }); // Inicia a música
        if (window.mostrarToast) window.mostrarToast("Modo Foco e Lo-Fi Ativados 🎧", "🔦");
    } else {
        document.body.classList.remove('modo-lanterna');
        audioLanterna.pause(); // Pausa a música
        if (window.mostrarToast) window.mostrarToast("Modo Foco Desativado", "💡");
    }
});
const toggleEscuro = document.getElementById('toggleModoEscuro');
if (localStorage.getItem('modoEscuro') === 'ativado') { document.body.classList.add('dark-mode'); toggleEscuro.checked = true; }
toggleEscuro?.addEventListener('change', (e) => {
    if (e.target.checked) { document.body.classList.add('dark-mode'); localStorage.setItem('modoEscuro', 'ativado'); }
    else { document.body.classList.remove('dark-mode'); localStorage.setItem('modoEscuro', 'desativado'); }
});

document.getElementById('btnAbrirConfig')?.addEventListener('click', () => { document.getElementById('modalConfig').classList.remove('escondido'); document.getElementById('msgPerfil').innerText = ''; });

document.querySelectorAll('.btn-fechar-modal').forEach(btn => {
    btn.addEventListener('click', (e) => { e.target.closest('.modal-overlay').classList.add('escondido'); });
});
// ==========================================
// HAMBURGER MENU
// ==========================================
const btnMenuHamburguer = document.getElementById('btnMenuHamburguer');
const dropdownMenu = document.getElementById('dropdownMenu');

btnMenuHamburguer?.addEventListener('click', (e) => {
    e.stopPropagation();
    const estaAberto = !dropdownMenu.classList.contains('escondido');
    dropdownMenu.classList.toggle('escondido', estaAberto);
    btnMenuHamburguer.classList.toggle('aberto', !estaAberto);
});

// Fecha ao clicar fora
document.addEventListener('click', (e) => {
    if (!dropdownMenu?.contains(e.target) && e.target !== btnMenuHamburguer) {
        dropdownMenu?.classList.add('escondido');
        btnMenuHamburguer?.classList.remove('aberto');
    }
});

// Fecha ao clicar em qualquer item do menu
dropdownMenu?.addEventListener('click', (e) => {
    if (e.target.classList.contains('dropdown-item')) {
        dropdownMenu.classList.add('escondido');
        btnMenuHamburguer?.classList.remove('aberto');
    }
});

// ==========================================
// BOTTOM NAV MOBILE
// ==========================================
function trocarPainelMobile(painel) {
    const painelEditor = document.getElementById('painelEditor');
    const painelLateral = document.getElementById('painelLateral');
    const containerMusica = document.getElementById('containerMusica');
    const containerPlanos = document.getElementById('containerPlanos');
    const containerContagem = document.getElementById('containerContagem');

    document.querySelectorAll('.nav-mobile-btn').forEach(b => {
        b.classList.toggle('ativo', b.getAttribute('data-painel') === painel);
    });

    if (window.innerWidth > 768) {
        // Desktop: garante que nada fique escondido por erro
        painelEditor?.classList.remove('painel-mobile-oculto');
        painelLateral?.classList.remove('painel-mobile-oculto');
        containerMusica?.classList.remove('painel-mobile-oculto');
        containerPlanos?.classList.remove('painel-mobile-oculto');
        containerContagem?.classList.remove('painel-mobile-oculto');
        return;
    }

    if (painel === 'editor') {
        painelEditor?.classList.remove('painel-mobile-oculto');
        painelLateral?.classList.add('painel-mobile-oculto');
    } else {
        painelEditor?.classList.add('painel-mobile-oculto');
        painelLateral?.classList.remove('painel-mobile-oculto');

        // Esconde todos os componentes do painel lateral primeiro
        containerMusica?.classList.add('painel-mobile-oculto');
        containerPlanos?.classList.add('painel-mobile-oculto');
        containerContagem?.classList.add('painel-mobile-oculto');

        // Mostra só o que foi selecionado
        if (painel === 'musica') containerMusica?.classList.remove('painel-mobile-oculto');
        if (painel === 'planos') containerPlanos?.classList.remove('painel-mobile-oculto');
        if (painel === 'contagem') containerContagem?.classList.remove('painel-mobile-oculto');
    }
}

document.querySelectorAll('.nav-mobile-btn').forEach(btn => {
    btn.addEventListener('click', () => trocarPainelMobile(btn.getAttribute('data-painel')));
});

// Ao redimensionar para desktop, limpa estado mobile
window.addEventListener('resize', () => {
    if (window.innerWidth > 768) trocarPainelMobile('editor');
});

document.getElementById('btnSalvarPerfil')?.addEventListener('click', async () => {
    const novoNome = document.getElementById('inputNomePerfil').value.trim();
    if (novoNome !== "" && usuarioAtual) {
        await update(ref(database, `usuarios/${usuarioAtual.uid}`), { nome: novoNome });
        nomeExibicaoAtual = novoNome; document.getElementById('infoUsuarioDash').innerText = `${nomeExibicaoAtual}`;
        document.getElementById('msgPerfil').innerText = "Nome salvo com sucesso!"; document.getElementById('msgPerfil').style.color = "#4CAF50";
    }
});

document.getElementById('inputFotoPerfil')?.addEventListener('change', (e) => {
    const arquivo = e.target.files[0];
    if (!arquivo || !usuarioAtual) return;
    const leitor = new FileReader();
    leitor.onload = function (evt) {
        const img = new Image();
        img.onload = async function () {
            const cvs = document.createElement('canvas'); cvs.width = 150; cvs.height = img.height * (150 / img.width);
            cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);
            const fotoBase64 = cvs.toDataURL('image/jpeg', 0.6);
            await update(ref(database, `usuarios/${usuarioAtual.uid}`), { fotoPerfil: fotoBase64 });
            document.getElementById('avatarConfig').src = fotoBase64; document.getElementById('avatarDashboard').src = fotoBase64;
            document.getElementById('msgPerfil').innerText = "Foto atualizada!"; document.getElementById('msgPerfil').style.color = "#4CAF50";
        }; img.src = evt.target.result;
    }; leitor.readAsDataURL(arquivo);
});

document.getElementById('btnEsqueciSenha')?.addEventListener('click', (e) => {
    e.preventDefault();
    const email = prompt("E-mail de cadastro para redefinição:");
    if (email) { sendPasswordResetEmail(auth, email.trim()).then(() => alert("E-mail enviado!")).catch(erro => alert("Erro: " + erro.message)); }
});

document.getElementById('btnAlterarSenhaEmail')?.addEventListener('click', () => {
    if (usuarioAtual) {
        sendPasswordResetEmail(auth, usuarioAtual.email).then(() => {
            document.getElementById('msgPerfil').innerText = "Link enviado para o e-mail!"; document.getElementById('msgPerfil').style.color = "#4CAF50";
        }).catch(erro => { document.getElementById('msgPerfil').innerText = "Erro: " + erro.message; document.getElementById('msgPerfil').style.color = "#f44336"; });
    }
});

// ==========================================
// 3. LOGIN E ESTADO DO USUÁRIO
// ==========================================
document.getElementById('btnCadastrar')?.addEventListener('click', () => createUserWithEmailAndPassword(auth, document.getElementById('inputEmail').value, document.getElementById('inputSenha').value).catch(e => document.getElementById('mensagemLogin').innerText = e.message));
document.getElementById('btnEntrar')?.addEventListener('click', () => signInWithEmailAndPassword(auth, document.getElementById('inputEmail').value, document.getElementById('inputSenha').value).catch(() => document.getElementById('mensagemLogin').innerText = "Dados incorretos."));
document.getElementById('btnSairDash')?.addEventListener('click', () => signOut(auth));

onAuthStateChanged(auth, async (usuarioLogado) => {
    if (usuarioLogado) {
        usuarioAtual = usuarioLogado;
        let fotoDoBanco = AVATAR_PADRAO;
        try {
            const snapshot = await get(ref(database, `usuarios/${usuarioAtual.uid}`));
            if (snapshot.exists()) {
                if (snapshot.val().nome) nomeExibicaoAtual = snapshot.val().nome;
                if (snapshot.val().fotoPerfil) fotoDoBanco = snapshot.val().fotoPerfil;
            } else {
                nomeExibicaoAtual = usuarioAtual.email.split('@')[0];
                await set(ref(database, `usuarios/${usuarioAtual.uid}`), { email: usuarioAtual.email, nome: nomeExibicaoAtual, fotoPerfil: AVATAR_PADRAO });
            }
        } catch (erro) { alert("Erro ao conectar."); return; }

        telaLogin.classList.add('escondido'); telaApp.classList.add('escondido'); telaDashboard.classList.remove('escondido');
        document.getElementById('infoUsuarioDash').innerText = `${nomeExibicaoAtual}`;
        document.getElementById('inputNomePerfil').value = nomeExibicaoAtual;
        document.getElementById('avatarDashboard').src = fotoDoBanco; document.getElementById('avatarConfig').src = fotoDoBanco;

        carregarCadernos(); vigiarConvites();
    } else {
        usuarioAtual = null; telaLogin.classList.remove('escondido'); telaDashboard.classList.add('escondido'); telaApp.classList.add('escondido');
    }
});

function vigiarConvites() {
    if (!usuarioAtual) return;
    onValue(ref(database, `convites/${usuarioAtual.uid}`), (snapshot) => {
        const areaConvites = document.getElementById('areaConvites'); const listaConvites = document.getElementById('listaDeConvites'); listaConvites.innerHTML = '';
        if (snapshot.exists()) {
            areaConvites.classList.remove('escondido');
            snapshot.forEach((filho) => {
                const idConvite = filho.key; const dados = filho.val(); const li = document.createElement('li');
                li.style.display = "flex"; li.style.justifyContent = "space-between"; li.style.alignItems = "center"; li.style.marginBottom = "8px"; li.style.border = "none";
                li.innerHTML = `<span style="font-size: 14px; color: #333;"><strong>${dados.remetenteNome}</strong> te convidou como <b>${dados.permissao.toUpperCase()}</b> para <em>"${dados.tituloCaderno}"</em></span>`;
                const botoes = document.createElement('div');
                const btnAceitar = document.createElement('button'); btnAceitar.innerText = "✔️ Aceitar"; btnAceitar.className = "btn-pequeno"; btnAceitar.style.backgroundColor = "#4CAF50"; btnAceitar.style.color = "white";
                const btnRecusar = document.createElement('button'); btnRecusar.innerText = "❌ Recusar"; btnRecusar.className = "btn-pequeno btn-sair";
                btnAceitar.onclick = async () => { await update(ref(database, `cadernos/${dados.cadernoId}/usuarios_permitidos`), { [usuarioAtual.uid]: dados.permissao }); await remove(ref(database, `convites/${usuarioAtual.uid}/${idConvite}`)); };
                btnRecusar.onclick = async () => await remove(ref(database, `convites/${usuarioAtual.uid}/${idConvite}`));
                botoes.appendChild(btnAceitar); botoes.appendChild(btnRecusar); li.appendChild(botoes); listaConvites.appendChild(li);
            });
        } else areaConvites.classList.add('escondido');
    });
}

// ==========================================
// 4. DASHBOARD E CADERNOS
// ==========================================
let corSelecionadaParaNovoCaderno = "#2196F3";
const bolinhasDeCor = document.querySelectorAll('#seletorDeCores .bolinha-cor');
bolinhasDeCor.forEach(bolinha => {
    bolinha.addEventListener('click', (e) => { bolinhasDeCor.forEach(b => b.classList.remove('selecionada')); e.target.classList.add('selecionada'); corSelecionadaParaNovoCaderno = e.target.getAttribute('data-cor'); });
});

document.getElementById('btnCriarCaderno')?.addEventListener('click', () => {
    const titulo = document.getElementById('inputNovoCaderno').value.trim();
    if (titulo !== '') {
        push(ref(database, 'cadernos'), { titulo: titulo, dono: usuarioAtual.uid, corTema: corSelecionadaParaNovoCaderno, usuarios_permitidos: { [usuarioAtual.uid]: "dono" }, dataCriacao: Date.now(), totalPaginas: 1 });
        document.getElementById('inputNovoCaderno').value = '';
    }
});

function carregarCadernos() {
    onValue(ref(database, 'cadernos'), (snapshot) => {
        const lista = document.getElementById('listaDeCadernos'); lista.innerHTML = '';
        snapshot.forEach((filho) => {
            const id = filho.key; const dados = filho.val();
            if (dados.usuarios_permitidos && dados.usuarios_permitidos[usuarioAtual.uid]) {
                const li = document.createElement('li'); li.className = 'item-caderno';
                li.style.borderLeft = `5px solid ${dados.corTema || "#2196F3"}`;

                const perm = dados.usuarios_permitidos[usuarioAtual.uid];
                let icone = perm === 'dono' ? "👑" : perm === 'admin' ? "🛡️" : perm === 'editor' ? "✏️" : "👁️";

                const spanTitulo = document.createElement('span'); spanTitulo.innerHTML = `<strong>${icone} ${dados.titulo}</strong>`;
                const btnAbrir = document.createElement('button'); btnAbrir.innerText = 'Abrir';
                btnAbrir.addEventListener('click', () => abrirCaderno(id, dados.titulo, perm));
                li.appendChild(spanTitulo); li.appendChild(btnAbrir); lista.appendChild(li);
            }
        });
    });
}

document.getElementById('btnVoltarDash')?.addEventListener('click', () => {
    telaApp.classList.add('escondido'); telaDashboard.classList.remove('escondido');
    if (refMinhaPresenca) remove(refMinhaPresenca);
    if (escutaAnotacoes) escutaAnotacoes(); if (escutaTarefas) escutaTarefas(); if (escutaStickers) escutaStickers();
    if (escutaDesenhos) escutaDesenhos(); if (escutaTotalPaginas) escutaTotalPaginas();
    if (escutaPresenca) escutaPresenca(); if (escutaAmei) escutaAmei();

    cadernoAtualId = null;
    document.getElementById('containerMusica').classList.add('escondido'); document.getElementById('widgetMusica').innerHTML = '';
});

// --- SUBSTITUA A FUNÇÃO abrirCaderno INTEIRA NO main.js ---
async function abrirCaderno(id, titulo, permissao) {
    // 1. Puxa as configurações para ver se tem senha
    const snapConfig = await get(ref(database, `cadernos/${id}/config`));
    const config = snapConfig.val() || {};

    // 2. O Loop de Segurança (Se tiver senha)
    if (config.pin && config.pin.trim() !== '') {
        let senhaCorreta = false;

        while (!senhaCorreta) {
            // Cria uma promessa que pausa o código até o usuário clicar num botão do Modal
            const tentativa = await new Promise((resolve) => {
                const modal = document.getElementById('modalAcessoCaderno');
                const input = document.getElementById('inputTentativaSenha');
                const btnOk = document.getElementById('btnConfirmarSenhaCaderno');
                const btnCancel = document.getElementById('btnCancelarAcesso');

                modal.classList.remove('escondido');
                input.value = '';
                input.focus();

                const onClickOk = () => { limpar(); resolve(input.value); };
                const onClickCancel = () => { limpar(); resolve(null); };
                const onEnter = (e) => { if (e.key === 'Enter') onClickOk(); };

                const limpar = () => {
                    btnOk.removeEventListener('click', onClickOk);
                    btnCancel.removeEventListener('click', onClickCancel);
                    input.removeEventListener('keypress', onEnter);
                    modal.classList.add('escondido');
                };

                btnOk.addEventListener('click', onClickOk);
                btnCancel.addEventListener('click', onClickCancel);
                input.addEventListener('keypress', onEnter);
            });

            // Se o usuário clicou em Cancelar, aborta tudo e volta pro Dashboard
            if (tentativa === null) return;

            // Verifica a senha
            if (tentativa === config.pin) {
                senhaCorreta = true;
            } else {
                // Se errou, pausa o código de novo mostrando o Modal de Erro
                await new Promise((resolve) => {
                    const modalErro = document.getElementById('modalAcessoNegado');
                    const btnTentar = document.getElementById('btnTentarSenhaNovamente');

                    modalErro.classList.remove('escondido');

                    const onClickTentar = () => {
                        btnTentar.removeEventListener('click', onClickTentar);
                        modalErro.classList.add('escondido');
                        resolve();
                    };
                    btnTentar.addEventListener('click', onClickTentar);
                });
            }
        }
    }

    // 3. Se passou pela segurança (ou não tinha senha), Abre o Caderno!
    cadernoAtualId = id;
    minhaPermissaoAtual = permissao;
    souDonoDoCadernoAtual = (permissao === 'dono');
    souAdminOuDono = (permissao === 'dono' || permissao === 'admin');

    telaDashboard.classList.add('escondido'); telaApp.classList.remove('escondido');
    document.getElementById('tituloCadernoAtual').innerText = titulo;

    document.querySelectorAll('.item-admin').forEach(el => {
        el.classList.toggle('escondido', !souAdminOuDono);
    });

    if (minhaPermissaoAtual === 'leitor') {
        caixaDeTexto.contentEditable = false;
        document.getElementById('controlesDeEdicao').classList.add('escondido');
        document.getElementById('controlesEdicaoPagina').classList.add('escondido');
        document.getElementById('controlesTarefas').classList.add('escondido');
    } else {
        caixaDeTexto.contentEditable = true;
        document.getElementById('controlesDeEdicao').classList.remove('escondido');
        document.getElementById('controlesEdicaoPagina').classList.remove('escondido');
        document.getElementById('controlesTarefas').classList.remove('escondido');
    }

    const snap = await get(ref(database, `cadernos/${id}/totalPaginas`));
    totalPaginas = snap.val() || 1; paginaAtual = 1;
    iniciarRotinasDoCaderno(); carregarPaginaAtual();
    trocarPainelMobile('editor');

    resetarTimerInatividade();
}

// ==========================================
// 5. GESTÃO AVANÇADA DE PERMISSÕES E CONVITES
// ==========================================
document.getElementById('btnAbrirModalConvidar')?.addEventListener('click', () => { document.getElementById('modalConvidar').classList.remove('escondido'); document.getElementById('inputEmailConvite').value = ''; });

document.getElementById('btnEnviarConvite')?.addEventListener('click', async () => {
    if (!souAdminOuDono) return;
    const emailAmigo = document.getElementById('inputEmailConvite').value.trim().toLowerCase();
    const permEscolhida = document.getElementById('selectPermissaoConvite').value;

    if (emailAmigo !== "") {
        let amigoUid = null;
        // Procura no banco garantindo que o e-mail não tenha diferenças de maiúsculas
        for (let uid in usuariosDb) {
            if (usuariosDb[uid].email.toLowerCase() === emailAmigo) amigoUid = uid;
        }

        if (amigoUid) {
            // TRAVA DE SEGURANÇA: Impede de convidar a si mesmo!
            if (amigoUid === usuarioAtual.uid) {
                if (window.mostrarToast) window.mostrarToast("Você não pode convidar a si mesmo!", "❌");
                return;
            }

            await push(ref(database, `convites/${amigoUid}`), {
                cadernoId: cadernoAtualId,
                tituloCaderno: document.getElementById('tituloCadernoAtual').innerText,
                remetenteNome: nomeExibicaoAtual,
                permissao: permEscolhida
            });
            if (window.mostrarToast) window.mostrarToast("Convite enviado com sucesso!", "💌");
            document.getElementById('modalConvidar').classList.add('escondido');
        } else {
            if (window.mostrarToast) window.mostrarToast("E-mail não encontrado. Peça para ele criar uma conta!", "❌");
        }
    }
});

document.getElementById('btnVerParticipantes')?.addEventListener('click', async () => {
    document.getElementById('modalParticipantes').classList.remove('escondido');
    const listaUI = document.getElementById('listaDeParticipantesModal'); listaUI.innerHTML = "<li>Carregando...</li>";
    const cadernoSnap = await get(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos`)); const usuariosPermitidos = cadernoSnap.val(); listaUI.innerHTML = "";

    for (const uid in usuariosPermitidos) {
        const permissao = usuariosPermitidos[uid]; const dadosPessoa = usuariosDb[uid] || {};
        const nomeP = dadosPessoa.nome || dadosPessoa.email || "Usuário"; const fotoP = dadosPessoa.fotoPerfil || AVATAR_PADRAO;
        const li = document.createElement('li'); li.style.justifyContent = "space-between"; li.style.flexWrap = "wrap";

        let controlePermissao = '';
        if (souAdminOuDono && permissao !== 'dono' && uid !== usuarioAtual.uid) {
            controlePermissao = `
                <select class="select-permissao" data-uid="${uid}" style="font-size: 11px; padding: 2px; border-radius: 4px; margin-left: 5px; background: var(--bg-caixas); color: var(--texto-principal); border: 1px solid var(--borda);">
                    <option value="admin" ${permissao === 'admin' ? 'selected' : ''}>Admin</option>
                    <option value="editor" ${permissao === 'editor' ? 'selected' : ''}>Editor</option>
                    <option value="leitor" ${permissao === 'leitor' ? 'selected' : ''}>Leitor</option>
                </select>
            `;
        } else {
            let classeCor = permissao === 'dono' ? 'cargo-dono' : permissao === 'admin' ? 'cargo-admin' : permissao === 'editor' ? 'cargo-editor' : 'cargo-leitor';
            controlePermissao = `<span class="tag-cargo ${classeCor}">${permissao.toUpperCase()}</span>`;
        }

        const divInfo = document.createElement('div'); divInfo.className = "avatar-container"; divInfo.style.flex = "1";
        divInfo.innerHTML = `<img src="${fotoP}" class="avatar-pequeno"><span>${nomeP} ${controlePermissao}</span>`;
        li.appendChild(divInfo);

        if (souAdminOuDono && permissao !== 'dono' && uid !== usuarioAtual.uid) {
            const btnRemover = document.createElement('button'); btnRemover.innerText = '🗑️'; btnRemover.className = 'btn-pequeno btn-sair';
            let clicouUmaVez = false;
            btnRemover.onclick = async () => {
                if (!clicouUmaVez) { btnRemover.innerText = 'Certeza?'; btnRemover.classList.add('btn-confirmar-exclusao'); clicouUmaVez = true; setTimeout(() => { btnRemover.innerText = '🗑️'; btnRemover.classList.remove('btn-confirmar-exclusao'); clicouUmaVez = false; }, 3000); }
                else { await remove(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos/${uid}`)); li.remove(); }
            }; li.appendChild(btnRemover);
        }
        listaUI.appendChild(li);
    }

    document.querySelectorAll('.select-permissao').forEach(select => {
        select.addEventListener('change', async (e) => {
            const alvoUid = e.target.getAttribute('data-uid'); const novaPermissao = e.target.value;
            await update(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos`), { [alvoUid]: novaPermissao });
        });
    });
});

// --- LÓGICA DE SAIR DO CADERNO / TRANSFERIR POSSE ---
document.getElementById('btnSairDoCaderno')?.addEventListener('click', async () => {
    if (!cadernoAtualId) return;

    const cadernoSnap = await get(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos`));
    const usuariosPermitidos = cadernoSnap.val() || {};
    const qtdParticipantes = Object.keys(usuariosPermitidos).length;

    if (minhaPermissaoAtual !== 'dono') {
        // NOVO: Em vez do alert feio, abrimos o Modal Personalizado!
        document.getElementById('modalConfirmarSaida').classList.remove('escondido');
    } else {
        if (qtdParticipantes === 1) {
            document.getElementById('modalParticipantes').classList.add('escondido');
            document.getElementById('btnAbrirModalExcluirCaderno').click();
        } else {
            const select = document.getElementById('selectNovoDono');
            select.innerHTML = '';
            for (const uid in usuariosPermitidos) {
                if (uid !== usuarioAtual.uid) {
                    const dadosPessoa = usuariosDb[uid] || {};
                    const nome = dadosPessoa.nome || dadosPessoa.email || "Usuário";
                    select.innerHTML += `<option value="${uid}">${nome}</option>`;
                }
            }
            document.getElementById('modalParticipantes').classList.add('escondido');
            document.getElementById('modalTransferirDono').classList.remove('escondido');
        }
    }
});

// Confirmação de Saída para não-donos
document.getElementById('btnConfirmarSaidaAcao')?.addEventListener('click', async () => {
    if (!cadernoAtualId) return;
    await remove(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos/${usuarioAtual.uid}`));
    document.getElementById('modalConfirmarSaida').classList.add('escondido');
    document.getElementById('modalParticipantes').classList.add('escondido');
    document.getElementById('btnVoltarDash').click();
    if (window.mostrarToast) window.mostrarToast("Você saiu do caderno.", "🚪");
});

document.getElementById('btnConfirmarTransferenciaSaida')?.addEventListener('click', async () => {
    const novoDonoUid = document.getElementById('selectNovoDono').value;
    if (novoDonoUid && cadernoAtualId) {
        // 1. Promove o amigo escolhido a Dono
        await update(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos`), { [novoDonoUid]: 'dono' });
        // 2. Remove você mesmo do caderno
        await remove(ref(database, `cadernos/${cadernoAtualId}/usuarios_permitidos/${usuarioAtual.uid}`));

        document.getElementById('modalTransferirDono').classList.add('escondido');
        document.getElementById('btnVoltarDash').click();
        if (window.mostrarToast) window.mostrarToast("Coroa transferida! Você saiu do caderno.", "👑");
    }
});

let corCadernoEdit = "#2196F3";
const bolinhasEdit = document.querySelectorAll('#seletorCorCadernoAtual .bolinha-cor');
bolinhasEdit.forEach(b => {
    b.addEventListener('click', (e) => { bolinhasEdit.forEach(b => b.classList.remove('selecionada')); e.target.classList.add('selecionada'); corCadernoEdit = e.target.getAttribute('data-cor'); });
});

document.getElementById('btnConfigCaderno')?.addEventListener('click', async () => {
    document.getElementById('modalConfigCaderno').classList.remove('escondido');
    document.getElementById('inputEditNomeCaderno').value = document.getElementById('tituloCadernoAtual').innerText;
    document.getElementById('inputPinCaderno').value = config.pin || '';

    if (souDonoDoCadernoAtual) { document.getElementById('btnAbrirModalExcluirCaderno').classList.remove('escondido'); }
    else { document.getElementById('btnAbrirModalExcluirCaderno').classList.add('escondido'); }

    const cadernoAtualSnap = await get(ref(database, `cadernos/${cadernoAtualId}`));
    if (cadernoAtualSnap.exists()) {
        const d = cadernoAtualSnap.val(); corCadernoEdit = d.corTema || "#2196F3";
        const config = d.config || {};
        document.getElementById('selectFonteCaderno').value = config.fonte || 'fonte-padrao';
        document.getElementById('selectFundoCaderno').value = config.fundo || 'fundo-limpo';
        document.getElementById('inputLinkMusica').value = config.musica || '';
        bolinhasEdit.forEach(b => { b.classList.remove('selecionada'); if (b.getAttribute('data-cor') === corCadernoEdit) b.classList.add('selecionada'); });
    }
});

// --- CORREÇÃO: Salvamento Seguro das Configurações ---
document.getElementById('btnSalvarConfigCaderno')?.addEventListener('click', async () => {
    if (!cadernoAtualId) return;

    const novoNome = document.getElementById('inputEditNomeCaderno').value.trim();
    const pinInput = document.getElementById('inputPinCaderno');
    const pinValue = pinInput ? pinInput.value.trim() : '';

    try {
        // 1. Atualiza as informações principais do caderno
        await update(ref(database, `cadernos/${cadernoAtualId}`), {
            titulo: novoNome !== "" ? novoNome : document.getElementById('tituloCadernoAtual').innerText,
            corTema: corCadernoEdit
        });

        // 2. Atualiza a sub-árvore de configurações (Fundo, Fonte, Música e PIN)
        await update(ref(database, `cadernos/${cadernoAtualId}/config`), {
            fonte: document.getElementById('selectFonteCaderno').value,
            fundo: document.getElementById('selectFundoCaderno').value,
            musica: document.getElementById('inputLinkMusica').value.trim(),
            pin: pinValue
        });

        document.getElementById('modalConfigCaderno').classList.add('escondido');
    } catch (erro) {
        console.error("Erro ao salvar config:", erro);
    }
});

// Aproveite e atualize a função que ABRE o modal de config para carregar o PIN corretamente:
document.getElementById('btnConfigCaderno')?.addEventListener('click', async () => {
    document.getElementById('modalConfigCaderno').classList.remove('escondido');
    document.getElementById('inputEditNomeCaderno').value = document.getElementById('tituloCadernoAtual').innerText;

    if (souDonoDoCadernoAtual) { document.getElementById('btnAbrirModalExcluirCaderno').classList.remove('escondido'); }
    else { document.getElementById('btnAbrirModalExcluirCaderno').classList.add('escondido'); }

    const cadernoAtualSnap = await get(ref(database, `cadernos/${cadernoAtualId}`));
    if (cadernoAtualSnap.exists()) {
        const d = cadernoAtualSnap.val();
        corCadernoEdit = d.corTema || "#2196F3";
        const config = d.config || {};

        document.getElementById('selectFonteCaderno').value = config.fonte || 'fonte-padrao';
        document.getElementById('selectFundoCaderno').value = config.fundo || 'fundo-limpo';
        document.getElementById('inputLinkMusica').value = config.musica || '';

        const inputPin = document.getElementById('inputPinCaderno');
        if (inputPin) inputPin.value = config.pin || '';

        bolinhasEdit.forEach(b => { b.classList.remove('selecionada'); if (b.getAttribute('data-cor') === corCadernoEdit) b.classList.add('selecionada'); });
    }
});

document.getElementById('btnAbrirModalExcluirCaderno')?.addEventListener('click', () => {
    document.getElementById('modalExcluirCaderno').classList.remove('escondido');
    document.getElementById('inputConfirmarNomeCaderno').value = '';
    document.getElementById('btnConfirmarExcluirCaderno').disabled = true;
});

document.getElementById('inputConfirmarNomeCaderno')?.addEventListener('input', (e) => {
    document.getElementById('btnConfirmarExcluirCaderno').disabled = e.target.value !== document.getElementById('tituloCadernoAtual').innerText;
});

document.getElementById('btnConfirmarExcluirCaderno')?.addEventListener('click', async () => {
    if (souDonoDoCadernoAtual) {
        await remove(ref(database, `cadernos/${cadernoAtualId}`));
        await remove(ref(database, `anotacoes/${cadernoAtualId}`));
        await remove(ref(database, `tarefas/${cadernoAtualId}`));
        await remove(ref(database, `stickers/${cadernoAtualId}`));
        await remove(ref(database, `desenhos/${cadernoAtualId}`));
        await remove(ref(database, `presenca/${cadernoAtualId}`));
        await remove(ref(database, `amei/${cadernoAtualId}`));
        document.getElementById('modalExcluirCaderno').classList.add('escondido');
        document.getElementById('modalConfigCaderno').classList.add('escondido');
        document.getElementById('btnVoltarDash').click();
    }
});


// ==========================================
// 6. EDITOR DE TEXTO E POLAROIDS
// ==========================================
const toolbarFlutuante = document.getElementById('toolbarFlutuante');
const toolbarImagem = document.getElementById('toolbarImagem');
const toolbarSticker = document.getElementById('toolbarSticker');
let imagemSelecionada = null; let stickerSelecionado = null;

// --- SELEÇÃO DE ELEMENTOS E TRAVA DE SEGURANÇA ---
const selecionarElemento = (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor' || modoLeituraAtivo) return;

    if (e.target.tagName === 'IMG' || e.target.closest?.('.polaroid') || e.target.closest?.('.fita-cassete') || e.target.closest?.('.card-pergunta') || e.target.closest?.('.obj-flutuante')) {
        imagemSelecionada = e.target.closest('.polaroid') || e.target.closest('.fita-cassete') || e.target.closest('.card-pergunta') || e.target.closest('.obj-flutuante') || e.target;

        const coord = imagemSelecionada.getBoundingClientRect();
        const leftPos = coord.left + (coord.width / 2);
        const topPos = coord.top - 10;

        toolbarFlutuante.classList.add('escondido'); toolbarSticker.classList.add('escondido');
        toolbarImagem.classList.add('escondido'); document.getElementById('toolbarObjeto')?.classList.add('escondido');

        // Se for Ingresso, Carta, Raspadinha ou Post-it
        if (imagemSelecionada.classList.contains('obj-flutuante')) {
            const tbObj = document.getElementById('toolbarObjeto');
            const btnEditar = document.getElementById('btnObjEditar');
            if (btnEditar) btnEditar.style.display = imagemSelecionada.classList.contains('ingresso-card') ? 'none' : 'flex';
            tbObj.style.top = `${topPos}px`; tbObj.style.left = `${leftPos}px`;
            tbObj.classList.remove('escondido');
        } else {
            // Se for Polaroid, Fita Cassete OU Card de Pergunta, usa a toolbarImagem!
            toolbarImagem.style.top = `${topPos}px`; toolbarImagem.style.left = `${leftPos}px`;
            toolbarImagem.classList.remove('escondido');
        }
    } else if (!e.target.classList?.contains('polaroid-legenda') && !e.target.classList?.contains('fita-titulo') && !e.target.classList?.contains('ingresso-texto')) {
        imagemSelecionada = null;
        toolbarImagem.classList.add('escondido'); document.getElementById('toolbarObjeto')?.classList.add('escondido');
    }
};

// Ouve tanto clique tradicional quanto toque na tela
caixaDeTexto.addEventListener('mousedown', selecionarElemento);
caixaDeTexto.addEventListener('touchstart', selecionarElemento, { passive: true });

const addEventoOcultarTeclado = (id, callback) => {
    const btn = document.getElementById(id);
    if (btn) {
        btn.addEventListener('mousedown', (e) => { e.preventDefault(); callback(e); });
        // O passive: false permite o preventDefault no touch para não perder foco de digitação
        btn.addEventListener('touchstart', (e) => { e.preventDefault(); callback(e); }, { passive: false });
    }
};

addEventoOcultarTeclado('btnImgEsq', () => { if (imagemSelecionada) { imagemSelecionada.style.float = 'left'; imagemSelecionada.style.margin = '10px 15px 10px 0'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem'); } });
addEventoOcultarTeclado('btnImgCentro', () => { if (imagemSelecionada) { imagemSelecionada.style.float = 'none'; imagemSelecionada.style.display = 'block'; imagemSelecionada.style.margin = '15px auto'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem'); } });
addEventoOcultarTeclado('btnImgDir', () => { if (imagemSelecionada) { imagemSelecionada.style.float = 'right'; imagemSelecionada.style.margin = '10px 0 10px 15px'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem'); } });
addEventoOcultarTeclado('btnImgAumentar', () => { if (imagemSelecionada) { let l = parseInt(imagemSelecionada.style.maxWidth) || 45; if (l < 100) imagemSelecionada.style.maxWidth = (l + 10) + '%'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem'); } });
addEventoOcultarTeclado('btnImgDiminuir', () => { if (imagemSelecionada) { let l = parseInt(imagemSelecionada.style.maxWidth) || 45; if (l > 20) imagemSelecionada.style.maxWidth = (l - 10) + '%'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem'); } });
addEventoOcultarTeclado('btnImgApagar', () => { if (imagemSelecionada) { imagemSelecionada.remove(); toolbarImagem.classList.add('escondido'); salvarTextoFirebase(); } });

// BOTÕES GENÉRICOS DE TAMANHO E ROTAÇÃO (Todos podem usar)
addEventoOcultarTeclado('btnObjGirarEsq', () => { if (imagemSelecionada) { let r = parseInt(imagemSelecionada.getAttribute('data-rot')) || 0; r -= 15; imagemSelecionada.setAttribute('data-rot', r); imagemSelecionada.style.setProperty('--rot', `${r}deg`); salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarObjeto'); } });
addEventoOcultarTeclado('btnObjGirarDir', () => { if (imagemSelecionada) { let r = parseInt(imagemSelecionada.getAttribute('data-rot')) || 0; r += 15; imagemSelecionada.setAttribute('data-rot', r); imagemSelecionada.style.setProperty('--rot', `${r}deg`); salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarObjeto'); } });
addEventoOcultarTeclado('btnObjAumentar', () => { if (imagemSelecionada) { let w = parseInt(imagemSelecionada.style.width) || 280; if (w < 800) imagemSelecionada.style.width = (w + 20) + 'px'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarObjeto'); } });
addEventoOcultarTeclado('btnObjDiminuir', () => { if (imagemSelecionada) { let w = parseInt(imagemSelecionada.style.width) || 280; if (w > 150) imagemSelecionada.style.width = (w - 20) + 'px'; salvarTextoFirebase(); sincronizarToolbarArrasto(imagemSelecionada, 'toolbarObjeto'); } });
addEventoOcultarTeclado('btnObjApagar', () => { if (imagemSelecionada) { imagemSelecionada.remove(); document.getElementById('toolbarObjeto')?.classList.add('escondido'); salvarTextoFirebase(); } });

// ==========================================
// LÓGICA DE EDIÇÃO (MODAIS E CINEMÁTICA)
// ==========================================

// Fecha a Toolbar ao clicar no Lápis e abre o Modal
addEventoOcultarTeclado('btnObjEditar', () => {
    if (!imagemSelecionada) return;

    document.getElementById('toolbarObjeto')?.classList.add('escondido');

    if (imagemSelecionada.classList.contains('carta-objeto')) {
        const papel = imagemSelecionada.querySelector('.carta-papel');
        document.getElementById('inputTextoCarta').value = papel.innerText || '';
        document.getElementById('modalEditarCarta').classList.remove('escondido');
    }
    else if (imagemSelecionada.classList.contains('raspadinha-objeto')) {
        const textoDiv = imagemSelecionada.querySelector('.raspadinha-texto');
        document.getElementById('inputTextoRaspadinha').value = textoDiv.innerText || '';
        document.getElementById('modalEditarRaspadinha').classList.remove('escondido');
    }
    else if (imagemSelecionada.classList.contains('postit-objeto')) {
        const textoDiv = imagemSelecionada.querySelector('.postit-texto');
        let txt = textoDiv.innerHTML.replace(/<br\s*[\/]?>/gi, "\n");
        const tempDiv = document.createElement("div"); tempDiv.innerHTML = txt;
        document.getElementById('inputTextoPostit').value = tempDiv.innerText || '';
        document.getElementById('modalEditarPostit').classList.remove('escondido');
    }
});

// Salvar Edição da Carta
document.getElementById('btnSalvarEdicaoCarta')?.addEventListener('click', () => {
    if (imagemSelecionada && imagemSelecionada.classList.contains('carta-objeto')) {
        const novoTexto = document.getElementById('inputTextoCarta').value;
        imagemSelecionada.querySelector('.carta-papel').innerHTML = novoTexto.replace(/\n/g, '<br>');
        salvarTextoFirebase();
        document.getElementById('modalEditarCarta').classList.add('escondido');
    }
});

// Salvar Edição da Raspadinha (Renova a tinta)
document.getElementById('btnSalvarEdicaoRaspadinha')?.addEventListener('click', () => {
    if (imagemSelecionada && imagemSelecionada.classList.contains('raspadinha-objeto')) {
        imagemSelecionada.querySelector('.raspadinha-texto').innerText = document.getElementById('inputTextoRaspadinha').value;
        imagemSelecionada.querySelector('.raspadinha-estado').src = "";
        imagemSelecionada.querySelector('.raspadinha-canvas').dataset.iniciado = "false";
        salvarTextoFirebase();
        document.getElementById('modalEditarRaspadinha').classList.add('escondido');
        if (typeof inicializarRaspadinhas === 'function') inicializarRaspadinhas();
    }
});

// --- LEITURA CINEMATOGRÁFICA DA CARTA ---
let idCartaLendoAtual = null;

window.animarElerCarta = (idContainer) => {
    const container = document.getElementById(idContainer);
    if (!container) return;

    // Roda o CSS 3D
    container.classList.add('aberta');

    // Aguarda a aba abrir e puxa pra tela inteira!
    setTimeout(() => {
        const textoDoPapel = container.querySelector('.carta-papel').innerHTML;
        document.getElementById('conteudoLeituraCarta').innerHTML = textoDoPapel;
        document.getElementById('modalLerCarta').classList.remove('escondido');
        idCartaLendoAtual = idContainer;
    }, 600);
};

// Fechar e guardar a carta
document.getElementById('btnFecharLeituraCarta')?.addEventListener('click', () => {
    document.getElementById('modalLerCarta').classList.add('escondido');
    if (idCartaLendoAtual) {
        document.getElementById(idCartaLendoAtual).classList.remove('aberta');
        idCartaLendoAtual = null;
    }
});

// UX de Mestre: Garante que TODAS as toolbars acompanhem o scroll da página
document.getElementById('painelEditor')?.addEventListener('scroll', () => {
    if (imagemSelecionada) {
        if (imagemSelecionada.classList.contains('obj-flutuante')) sincronizarToolbarArrasto(imagemSelecionada, 'toolbarObjeto');
        else sincronizarToolbarArrasto(imagemSelecionada, 'toolbarImagem');
    }
    // Garante que a barra do sticker não fique para trás
    if (stickerSelecionado) {
        sincronizarToolbarArrasto(stickerSelecionado, 'toolbarSticker');
    }
});

document.addEventListener('selectionchange', () => {
    if (telaApp.classList.contains('escondido') || minhaPermissaoAtual === 'leitor') return;
    const selecao = window.getSelection();
    if (selecao.rangeCount > 0 && selecao.toString().trim().length > 0) {
        const range = selecao.getRangeAt(0);
        if (caixaDeTexto.contains(range.commonAncestorContainer) && !range.commonAncestorContainer.parentElement.classList.contains('polaroid-legenda')) {
            const coord = range.getBoundingClientRect();
            toolbarFlutuante.style.top = `${coord.top}px`; toolbarFlutuante.style.left = `${coord.left + (coord.width / 2)}px`;
            toolbarFlutuante.classList.remove('escondido'); toolbarImagem.classList.add('escondido'); toolbarSticker.classList.add('escondido');
        } else toolbarFlutuante.classList.add('escondido');
    } else toolbarFlutuante.classList.add('escondido');
});

document.getElementById('btnNegrito')?.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('bold', false, null); });
document.getElementById('btnSublinhado')?.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('underline', false, null); });
document.getElementById('btnDestacar')?.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('backColor', false, '#ffeb3b'); document.execCommand('hiliteColor', false, '#ffeb3b'); document.execCommand('foreColor', false, '#000000'); });
document.getElementById('btnLimparFormato')?.addEventListener('mousedown', (e) => { e.preventDefault(); document.execCommand('removeFormat', false, null); const corPadrao = document.body.classList.contains('dark-mode') ? '#f5f5f5' : '#333333'; document.execCommand('foreColor', false, corPadrao); document.execCommand('backColor', false, 'transparent'); });

function salvarTextoFirebase() {
    if (minhaPermissaoAtual !== 'leitor' && cadernoAtualId) {
        // Passa o conteúdo pelo nosso Sanitizador antes de ir pro banco!
        const textoLimpo = sanitizarHTML(caixaDeTexto.innerHTML);
        set(ref(database, `anotacoes/${cadernoAtualId}/pagina_${paginaAtual}`), { texto: textoLimpo });
    }
}

let timerSalvarTexto;
let timerDigitando;
let euEstouDigitando = false; // NOVO: Controla se você está escrevendo neste exato segundo

caixaDeTexto.addEventListener('input', () => {
    if (cadernoAtualId && minhaPermissaoAtual !== 'leitor') {
        euEstouDigitando = true; // Trava a tela para não receber atualizações do amigo e apagar seu texto

        clearTimeout(timerSalvarTexto);
        clearTimeout(timerDigitando);

        if (refMinhaPresenca) update(refMinhaPresenca, { digitando: true });

        timerSalvarTexto = setTimeout(() => {
            salvarTextoFirebase();
            euEstouDigitando = false; // Libera a tela após salvar no banco
        }, 800);

        timerDigitando = setTimeout(() => {
            if (refMinhaPresenca) update(refMinhaPresenca, { digitando: false });
        }, 1500);
    }
});

// ==========================================
// CORREÇÃO: FORÇAR CURSOR NO FUNDO VAZIO
// ==========================================
caixaDeTexto.addEventListener('click', (e) => {
    if (minhaPermissaoAtual === 'leitor' || modoLeituraAtivo) return;

    // Se clicou no fundo pontilhado da folha (e não numa foto/ingresso)
    if (e.target === caixaDeTexto) {
        // Garante que exista um espaço para o texto nascer
        if (!caixaDeTexto.lastChild || caixaDeTexto.lastChild.nodeName !== 'BR') {
            caixaDeTexto.appendChild(document.createElement('br'));
        }

        // Mágica para forçar o navegador a jogar o cursor piscante no final da folha
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(caixaDeTexto);
        range.collapse(false); // false = final do conteúdo
        sel.removeAllRanges();
        sel.addRange(range);
        caixaDeTexto.focus();
    }
});

document.getElementById('inputFoto')?.addEventListener('change', (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return; const arquivo = e.target.files[0]; if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = function (evt) {
        const img = new Image();
        img.onload = function () {
            dispararSom('camera');
            const cvs = document.createElement('canvas'); cvs.width = 400; cvs.height = img.height * (400 / img.width);
            cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);

            const polaroidHTML = `
                <div class="polaroid" contenteditable="false" draggable="false" style="max-width: 45%; float: none; display: block; margin: 15px auto;">
                    <img src="${cvs.toDataURL('image/jpeg', 0.8)}" class="polaroid-img" draggable="false">
                    <div class="polaroid-legenda" contenteditable="true" spellcheck="false">Escreva aqui...</div>
                </div><br>
            `;
            caixaDeTexto.insertAdjacentHTML('beforeend', polaroidHTML);
            // --- Blindagem contra Drag & Drop nativo no editor ---
            if (e.target.tagName === 'IMG' || e.target.closest?.('.polaroid') || e.target.closest?.('.fita-cassete') || e.target.closest?.('.ingresso-card')) {
                e.preventDefault();
            }

            caixaDeTexto.addEventListener('drop', (e) => {
                // Se por acaso o usuário conseguir arrastar e soltar algo solto, impedimos a injeção de HTML sujo
                if (e.dataTransfer?.files?.length > 0 || e.dataTransfer?.getData('text/html')?.includes('<img')) {
                    e.preventDefault();
                }
            });
            if (e.target.tagName === 'IMG' || e.target.closest?.('.polaroid') || e.target.closest?.('.fita-cassete') || e.target.closest?.('.ingresso-card') || e.target.closest?.('.card-pergunta')) {
                e.preventDefault();
            }
            salvarTextoFirebase(); document.getElementById('inputFoto').value = '';
        }; img.src = evt.target.result;
    }; leitor.readAsDataURL(arquivo);
});

// --- GERADOR DO POST-IT ---
document.getElementById('btnInserirPostit')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
    const postitHTML = `
        <div class="obj-flutuante postit-objeto" data-dono="${usuarioAtual.uid}" contenteditable="false" draggable="false" style="top: 150px; left: 80px; width: 160px;">
            <div class="drag-handle" title="Arraste para mover" contenteditable="false">✥ Mover</div>
            <div class="postit-texto">Lembrete rápido...</div>
        </div>
    `;
    caixaDeTexto.insertAdjacentHTML('beforeend', postitHTML);
    salvarTextoFirebase(); document.getElementById('menuStickers').classList.add('escondido');
});

// --- ADICIONE ESTE EVENTO PARA SALVAR O POST-IT ---
document.getElementById('btnSalvarEdicaoPostit')?.addEventListener('click', () => {
    if (imagemSelecionada && imagemSelecionada.classList.contains('postit-objeto')) {
        const novoTexto = document.getElementById('inputTextoPostit').value;
        imagemSelecionada.querySelector('.postit-texto').innerHTML = novoTexto.replace(/\n/g, '<br>');
        salvarTextoFirebase();
        document.getElementById('modalEditarPostit').classList.add('escondido');
    }
});

// ==========================================
// O POTE DE PERGUNTAS (Gerador de Diálogos)
// ==========================================
// ==========================================
// O POTE DE PERGUNTAS (Comportamento Polaroid)
// ==========================================
const bancoDePerguntas = [
    // Suas perguntas
    "Qual foi a sua primeira impressão de mim?",
    "Qual é a sua memória favorita que passamos juntos?",
    "Se pudéssemos viajar para qualquer lugar amanhã, para onde iríamos?",
    "Qual música te faz lembrar de mim e por quê?",
    "O que eu faço (mesmo sem perceber) que sempre te faz sorrir?",
    "Se você tivesse que descrever nossa conexão em 3 palavras, quais seriam?",
    "Qual é o seu maior sonho?",
    "O que você mais admira em mim?",
    "Qual foi a situação mais engraçada que já passamos juntos?",
    "Que personagens lembram de mim? E de você?",
    "Qual é a coisa mais louca que você gostaria de fazer comigo?",
    "Próximo passeio para fazermos:",
    "Suas séries e filmes favoritos:",
    "Quais são os seus maiores medos e como posso ajudar a enfrentá-los?",
    "Se fôssemos criar um feriado só nosso, como ele se chamaria e como seria comemorado?",
    "Qual é o talento inútil que você tem e que eu mais acho graça?",
    "Qual foi o momento exato em que você percebeu que seríamos muito próximos?",
    "Se pudéssemos viver em um universo de filme, série ou livro por um dia, qual escolheríamos?",
    "Qual é a sua comida conforto que sempre te deixa feliz?",
    "Que mania minha você achava estranha no começo, mas agora se acostumou?",
    "Qual é o melhor conselho que você já me deu (ou que eu já te dei)?",
    "Se a nossa vida juntos fosse um gênero de filme, qual seria?",
    "Qual assunto nós poderíamos passar horas conversando sem perceber o tempo passar?",
    "Qual pequena conquista do seu dia a dia você gostaria que nós celebrássemos mais?"
];

document.getElementById('btnPuxarAssunto')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;

    const perguntaSorteada = bancoDePerguntas[Math.floor(Math.random() * bancoDePerguntas.length)];

    // Agora nasce como um bloco fluído igual a Polaroid
    const cardHTML = `
        <div class="card-pergunta" contenteditable="false" draggable="false" style="width: 320px; max-width: 90%; float: none; display: block; margin: 15px auto;">
            <div class="pergunta-texto">"${perguntaSorteada}"</div>
        </div><br>
    `;

    caixaDeTexto.insertAdjacentHTML('beforeend', cardHTML);
    salvarTextoFirebase();
});

// ==========================================
// GRAVADOR DE VOZ (Fita Cassete)
// ==========================================
let gravadorDeAudio = null;
let pedacosDeAudio = [];
let tempoGravacao = 0;
let intervaloGravacao = null;

document.getElementById('btnGravarAudio')?.addEventListener('click', async (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
    const btn = e.target;

    // Se já estiver gravando, o clique vai PARAR a gravação
    if (gravadorDeAudio && gravadorDeAudio.state === 'recording') {
        gravadorDeAudio.stop();
        btn.innerHTML = '🎤 Gravar Voz';
        btn.style.backgroundColor = '#E91E63';
        clearInterval(intervaloGravacao);
        return;
    }

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        gravadorDeAudio = new MediaRecorder(stream);
        pedacosDeAudio = [];
        tempoGravacao = 0;

        // --- MÁGICA DE ÁUDIO (AnalyserNode) ---
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let animationIdVisualizer;

        const animarVisualizer = () => {
            if (gravadorDeAudio.state === 'recording') {
                analyser.getByteFrequencyData(dataArray);
                // Calcula a média do volume (de 0 a ~255)
                const soma = dataArray.reduce((a, b) => a + b, 0);
                const media = soma / dataArray.length;
                const volume = Math.min(100, Math.floor((media / 128) * 100)); // Porcentagem do volume

                // O botão age como uma "barra de volume" dinâmica
                btn.style.background = `linear-gradient(90deg, #ff9800 ${volume}%, #f44336 ${volume}%)`;
                animationIdVisualizer = requestAnimationFrame(animarVisualizer);
            }
        };

        gravadorDeAudio.ondataavailable = event => pedacosDeAudio.push(event.data);

        gravadorDeAudio.onstop = () => {
            // Limpa o visualizador da memória
            cancelAnimationFrame(animationIdVisualizer);
            audioCtx.close().catch(() => { });
            btn.style.background = ''; // Reseta cor do botão

            const blobAudio = new Blob(pedacosDeAudio, { type: 'audio/webm' });
            const leitor = new FileReader();

            leitor.onloadend = () => {
                const base64Audio = leitor.result;
                const fitaHTML = `
                    <div class="fita-cassete" contenteditable="false" draggable="false" style="width: 100%; max-width: 60%; float: none; display: block; margin: 25px auto;">
                        <svg viewBox="0 0 400 256" width="100%" xmlns="http://www.w3.org/2000/svg" style="display: block; filter: drop-shadow(0 10px 20px rgba(0,0,0,0.4));">
                            <defs>
                                <linearGradient id="plasticoGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#3a3a3a" />
                                    <stop offset="100%" stop-color="#1c1c1c" />
                                </linearGradient>
                                <linearGradient id="etiquetaGrad" x1="0%" y1="0%" x2="0%" y2="100%">
                                    <stop offset="0%" stop-color="#fdfbf7" />
                                    <stop offset="100%" stop-color="#e3dfd3" />
                                </linearGradient>
                            </defs>
                            <rect x="10" y="10" width="380" height="236" rx="15" fill="url(#plasticoGrad)" stroke="#111" stroke-width="2"/>
                            <line x1="30" y1="20" x2="370" y2="20" stroke="#555" stroke-width="2" opacity="0.5"/>
                            <line x1="30" y1="25" x2="370" y2="25" stroke="#555" stroke-width="2" opacity="0.5"/>
                            <rect x="35" y="35" width="330" height="135" rx="6" fill="url(#etiquetaGrad)" stroke="#bbaa99" stroke-width="1"/>
                            <rect x="35" y="35" width="330" height="35" rx="6" fill="#d35400"/>
                            <rect x="35" y="60" width="330" height="10" fill="#d35400"/> <line x1="45" y1="85" x2="355" y2="85" stroke="#ccc" stroke-width="1"/>
                            <line x1="45" y1="105" x2="355" y2="105" stroke="#ccc" stroke-width="1"/>
                            <rect x="120" y="80" width="160" height="55" rx="5" fill="#111" stroke="#000" stroke-width="3"/>
                            <circle cx="155" cy="107" r="22" fill="#ecf0f1" stroke="#95a5a6" stroke-width="2"/>
                            <circle cx="245" cy="107" r="22" fill="#ecf0f1" stroke="#95a5a6" stroke-width="2"/>
                            <circle cx="155" cy="107" r="18" fill="#2c2c2c"/> 
                            <circle cx="245" cy="107" r="12" fill="#2c2c2c"/>
                            <circle cx="155" cy="107" r="8" fill="#fff" stroke="#555" stroke-dasharray="4 4" stroke-width="6"/>
                            <circle cx="245" cy="107" r="8" fill="#fff" stroke="#555" stroke-dasharray="4 4" stroke-width="6"/>
                            <path d="M 70 195 L 330 195 L 350 246 L 50 246 Z" fill="#222" stroke="#111" stroke-width="2"/>
                            <circle cx="95" cy="220" r="7" fill="#000"/>
                            <circle cx="305" cy="220" r="7" fill="#000"/>
                            <circle cx="30" cy="30" r="4" fill="#666"/>
                            <circle cx="370" cy="30" r="4" fill="#666"/>
                            <circle cx="30" cy="226" r="4" fill="#666"/>
                            <circle cx="370" cy="226" r="4" fill="#666"/>
                        </svg>
                        <div class="fita-titulo" contenteditable="true" spellcheck="false" title="Escreva o nome da fita">Escreva aqui...</div>
                        <audio class="fita-player" controls src="${base64Audio}"></audio>
                    </div><br>
                `;
                caixaDeTexto.insertAdjacentHTML('beforeend', fitaHTML);
                salvarTextoFirebase();
            };
            leitor.readAsDataURL(blobAudio);
            stream.getTracks().forEach(track => track.stop());
        };

        gravadorDeAudio.start();
        animarVisualizer(); // Liga o gráfico do botão!
        btn.innerHTML = '⏹️ Parar (0s)';

        intervaloGravacao = setInterval(() => {
            tempoGravacao++;
            btn.innerHTML = `⏹️ Parar (${tempoGravacao}s)`;
            if (tempoGravacao >= 60) {
                gravadorDeAudio.stop();
                btn.innerHTML = '🎤 Gravar Voz';
                clearInterval(intervaloGravacao);
            }
        }, 1000);

    } catch (erro) {
        console.error("Erro ao acessar microfone:", erro);
        alert("Ops! Precisamos da permissão do microfone para gravar sua voz.");
    }
});

// ==========================================
// 7. LOUSA MÁGICA (CANVAS AVANÇADO)
// ==========================================
let modoDesenhoAtivo = false;
let desenhando = false;
let ferramentaAtual = 'caneta'; // caneta, marcador, spray, borracha

function redimensionarCanvas() {
    if (!canvasDesenho || !ctxDesenho) return;
    const novaLargura = folhaA4Wrapper.offsetWidth || 800;
    const novaAltura = folhaA4Wrapper.offsetHeight || 1000;
    if (canvasDesenho.width === novaLargura && canvasDesenho.height === novaAltura) return;

    const snapshot = canvasDesenho.toDataURL();
    canvasDesenho.width = novaLargura;
    canvasDesenho.height = novaAltura;

    const imgRestore = new Image();
    imgRestore.onload = () => ctxDesenho?.drawImage(imgRestore, 0, 0);
    imgRestore.src = snapshot;
}

function ajustarTamanhoCanvas() {
    if (!canvasDesenho) return;
    canvasDesenho.width = folhaA4Wrapper.offsetWidth || 800;
    canvasDesenho.height = folhaA4Wrapper.offsetHeight || 1000;
}

// --- ATIVAR O MODO FOCO DE DESENHO ---
document.getElementById('btnModoDesenho')?.addEventListener('click', () => {
    if (minhaPermissaoAtual === 'leitor') return;
    modoDesenhoAtivo = true;

    // Esconde os controles normais e a nav-mobile, e mostra a pílula de desenho!
    document.getElementById('controlesDeEdicao').classList.add('escondido');
    document.getElementById('navMobile')?.classList.add('escondido');
    document.getElementById('toolbarDesenho').classList.remove('escondido');

    folhaA4Wrapper.classList.add('modo-desenho');
    redimensionarCanvas();
});

// --- DESATIVAR E CONCLUIR ---
document.getElementById('btnFecharDesenho')?.addEventListener('click', () => {
    modoDesenhoAtivo = false;

    // Devolve a tela ao normal
    document.getElementById('toolbarDesenho').classList.add('escondido');
    document.getElementById('controlesDeEdicao').classList.remove('escondido');
    if (window.innerWidth <= 768) document.getElementById('navMobile')?.classList.remove('escondido');

    folhaA4Wrapper.classList.remove('modo-desenho');
});

// Troca de Ferramentas
document.querySelectorAll('.btn-ferramenta').forEach(btn => {
    btn.addEventListener('click', (e) => {
        document.querySelectorAll('.btn-ferramenta').forEach(b => b.classList.remove('ativo'));
        e.currentTarget.classList.add('ativo');
        ferramentaAtual = e.currentTarget.getAttribute('data-ferramenta');
    });
});

document.getElementById('btnNovaLousa')?.addEventListener('click', () => {
    if (minhaPermissaoAtual === 'leitor') return;
    document.getElementById('modalLimparLousa')?.classList.remove('escondido');
});

document.getElementById('btnConfirmarLimparLousa')?.addEventListener('click', async () => {
    if (ctxDesenho && canvasDesenho) ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);
    if (cadernoAtualId) await remove(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`));
    document.getElementById('modalLimparLousa')?.classList.add('escondido');
});

function getPosicaoCanvas(e) {
    const rect = canvasDesenho.getBoundingClientRect();
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    const scaleX = canvasDesenho.width / rect.width;
    const scaleY = canvasDesenho.height / rect.height;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
}

function iniciarDesenho(e) {
    if (!modoDesenhoAtivo || minhaPermissaoAtual === 'leitor' || !ctxDesenho) return;
    desenhando = true;
    const pos = getPosicaoCanvas(e);

    ctxDesenho.globalCompositeOperation = ferramentaAtual === 'borracha' ? 'destination-out' : 'source-over';

    // Puxa a cor exata do seletor em tempo real
    const corEscolhida = document.getElementById('inputCorDesenho').value;

    if (ferramentaAtual === 'marcador') {
        ctxDesenho.strokeStyle = corEscolhida;
        ctxDesenho.globalAlpha = 0.4;
        ctxDesenho.lineWidth = 20;
    } else {
        ctxDesenho.strokeStyle = corEscolhida;
        ctxDesenho.globalAlpha = 1.0;
        ctxDesenho.lineWidth = ferramentaAtual === 'borracha' ? 25 : 3;
    }

    ctxDesenho.lineCap = 'round';
    ctxDesenho.lineJoin = 'round';

    if (ferramentaAtual !== 'spray') {
        ctxDesenho.beginPath();
        ctxDesenho.moveTo(pos.x, pos.y);
    } else {
        aplicarSpray(pos.x, pos.y);
    }
}

function aplicarSpray(x, y) {
    const densidade = 30;
    const raio = 15;
    // Aplica a cor ao Spray também
    const corEscolhida = document.getElementById('inputCorDesenho').value;
    ctxDesenho.fillStyle = corEscolhida;
    ctxDesenho.globalAlpha = 1.0;

    for (let i = 0; i < densidade; i++) {
        const angulo = Math.random() * Math.PI * 2;
        const r = Math.random() * raio;
        ctxDesenho.fillRect(x + r * Math.cos(angulo), y + r * Math.sin(angulo), 1.5, 1.5);
    }
}

function desenhar(e) {
    if (!desenhando || !modoDesenhoAtivo || !ctxDesenho) return;
    e.preventDefault(); // Trava a tela no mobile
    const pos = getPosicaoCanvas(e);

    if (ferramentaAtual === 'spray') {
        aplicarSpray(pos.x, pos.y);
    } else {
        ctxDesenho.lineTo(pos.x, pos.y);
        ctxDesenho.stroke();
    }
}

function pararDesenho() {
    if (desenhando && ctxDesenho) {
        desenhando = false;
        if (ferramentaAtual !== 'spray') ctxDesenho.closePath();

        // Retorna a opacidade ao normal para não afetar outros scripts
        ctxDesenho.globalAlpha = 1.0;

        const imagemBase64 = canvasDesenho.toDataURL('image/png');
        set(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`), { img: imagemBase64 });
    }
}

if (canvasDesenho) {
    canvasDesenho.addEventListener('mousedown', iniciarDesenho);
    canvasDesenho.addEventListener('mousemove', desenhar);
    canvasDesenho.addEventListener('mouseup', pararDesenho);
    canvasDesenho.addEventListener('mouseout', pararDesenho);
    canvasDesenho.addEventListener('touchstart', iniciarDesenho, { passive: false });
    canvasDesenho.addEventListener('touchmove', desenhar, { passive: false });
    canvasDesenho.addEventListener('touchend', pararDesenho);
}
// ==========================================
// 8. TAREFAS E EDIÇÃO
// ==========================================
document.getElementById('btnAdicionarTarefa')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return; const inp = document.getElementById('inputNovaTarefa');
    if (inp.value.trim() !== '') { push(ref(database, `tarefas/${cadernoAtualId}`), { texto: inp.value.trim(), concluida: false }); inp.value = ''; }
});

document.getElementById('btnSalvarEdicaoTarefa')?.addEventListener('click', async () => {
    if (tarefaSendoEditadaId && cadernoAtualId) {
        const novoTexto = document.getElementById('inputEdicaoTarefa').value.trim();
        if (novoTexto !== "") await update(ref(database, `tarefas/${cadernoAtualId}/${tarefaSendoEditadaId}`), { texto: novoTexto });
        document.getElementById('modalEditarTarefa').classList.add('escondido'); tarefaSendoEditadaId = null;
    }
});

document.getElementById('btnConfirmarApagarTarefa')?.addEventListener('click', async () => {
    if (tarefaSendoApagadaId && cadernoAtualId) {
        await remove(ref(database, `tarefas/${cadernoAtualId}/${tarefaSendoApagadaId}`));
        document.getElementById('modalApagarTarefa').classList.add('escondido'); tarefaSendoApagadaId = null;
    }
});

// Atualiza a posição da Toolbar em tempo real durante o arrasto
const sincronizarToolbarArrasto = (elemento, toolbarId) => {
    const tb = document.getElementById(toolbarId);
    if (tb && !tb.classList.contains('escondido')) {
        const coord = elemento.getBoundingClientRect();
        tb.style.top = `${coord.top - 10}px`;
        tb.style.left = `${coord.left + (coord.width / 2)}px`;
    }
};

// ==========================================
// 9. CÁPSULA DO TEMPO E STICKERS
// ==========================================
document.getElementById('btnTrancarPagina')?.addEventListener('click', () => { document.getElementById('modalCapsula').classList.remove('escondido'); });

document.getElementById('btnSalvarCapsula')?.addEventListener('click', async () => {
    const dataInput = document.getElementById('inputDataCapsula').value;
    if (dataInput) {
        const tsDesbloqueio = new Date(dataInput + "T00:00:00").getTime();
        await update(ref(database, `anotacoes/${cadernoAtualId}/pagina_${paginaAtual}`), { bloqueadoAte: tsDesbloqueio });
        document.getElementById('modalCapsula').classList.add('escondido');
    }
});

const menuStickers = document.getElementById('menuStickers');
document.getElementById('btnAbrirStickers')?.addEventListener('click', () => menuStickers.classList.toggle('escondido'));

document.querySelectorAll('.btn-sticker').forEach(btn => {
    btn.addEventListener('click', (e) => {
        if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
        push(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}`), { emoji: e.target.innerText, x: 50, y: 50, rot: 0 });
        menuStickers.classList.add('escondido');
    });
});

let stickerArrastado = null; let offsetXSticker = 0, offsetYSticker = 0;

const iniciarArrasteSticker = (e) => {
    if (minhaPermissaoAtual === 'leitor' || modoLeituraAtivo) return;
    const alvo = e.target;

    if (alvo.classList?.contains('sticker')) {
        // Trava o scroll da tela enquanto arrasta o adesivo (Vital para Mobile UX)
        if (e.type === 'touchstart') e.preventDefault();

        stickerArrastado = alvo;
        stickerSelecionado = alvo;
        const rect = stickerArrastado.getBoundingClientRect();

        // Pega a coordenada do Mouse OU do primeiro Dedo na tela
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        offsetXSticker = clientX - rect.left;
        offsetYSticker = clientY - rect.top;

        toolbarSticker.style.top = `${rect.top - 15}px`;
        toolbarSticker.style.left = `${rect.left + (rect.width / 2)}px`;
        toolbarSticker.classList.remove('escondido');
        toolbarFlutuante.classList.add('escondido');
        toolbarImagem.classList.add('escondido');
    } else {
        toolbarSticker.classList.add('escondido');
        stickerSelecionado = null;
    }
};

const moverSticker = (e) => {
    if (stickerArrastado) {
        if (e.type === 'touchmove') e.preventDefault(); // Previne scroll da página inteira
        const areaRect = areaStickers.getBoundingClientRect();

        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        let x = clientX - areaRect.left - offsetXSticker;
        let y = clientY - areaRect.top - offsetYSticker;

        stickerArrastado.style.left = `${x}px`;
        stickerArrastado.style.top = `${y}px`;
        toolbarSticker.classList.remove('escondido');
        sincronizarToolbarArrasto(stickerArrastado, 'toolbarSticker')
    }
};

const soltarSticker = () => {
    if (stickerArrastado && cadernoAtualId) {
        update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerArrastado.getAttribute('data-id')}`), { x: parseInt(stickerArrastado.style.left), y: parseInt(stickerArrastado.style.top) });
        stickerArrastado = null;
    }
};

// Listeners Duplos para garantir funcionamento 100% (PC + Mobile)
areaStickers?.addEventListener('mousedown', iniciarArrasteSticker);
areaStickers?.addEventListener('touchstart', iniciarArrasteSticker, { passive: false });

document.addEventListener('mousemove', moverSticker);
document.addEventListener('touchmove', moverSticker, { passive: false });

document.addEventListener('mouseup', soltarSticker);
document.addEventListener('touchend', soltarSticker);

// --- STICKERS ---
addEventoOcultarTeclado('btnStickerGirarEsq', () => { if (stickerSelecionado && cadernoAtualId) { let r = parseInt(stickerSelecionado.getAttribute('data-rot')) || 0; r -= 15; stickerSelecionado.setAttribute('data-rot', r); stickerSelecionado.style.transform = `rotate(${r}deg)`; update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`), { rot: r }); sincronizarToolbarArrasto(stickerSelecionado, 'toolbarSticker'); } });
addEventoOcultarTeclado('btnStickerGirarDir', () => { if (stickerSelecionado && cadernoAtualId) { let r = parseInt(stickerSelecionado.getAttribute('data-rot')) || 0; r += 15; stickerSelecionado.setAttribute('data-rot', r); stickerSelecionado.style.transform = `rotate(${r}deg)`; update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`), { rot: r }); sincronizarToolbarArrasto(stickerSelecionado, 'toolbarSticker'); } });
addEventoOcultarTeclado('btnStickerApagar', () => { if (stickerSelecionado && cadernoAtualId) { remove(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`)); toolbarSticker.classList.add('escondido'); stickerSelecionado = null; } });

// ==========================================
// MOTOR DE ARRASTO PARA OBJETOS FLUTUANTES (INGRESSO)
// ==========================================
let objetoFlutuanteArrastado = null;
let offsetObjX = 0, offsetObjY = 0;

const iniciarArrasteObjetoFlutuante = (e) => {
    if (minhaPermissaoAtual === 'leitor' || modoLeituraAtivo) return;

    const handle = e.target.closest('.drag-handle');
    if (handle) {
        e.preventDefault();
        objetoFlutuanteArrastado = handle.closest('.obj-flutuante');

        //Traz o objeto para a frente de todos os outros enquanto arrasta, para evitar que ele se perca atrás de outros elementos
        camadaGlobalZIndex++;
        objetoFlutuanteArrastado.style.zIndex = camadaGlobalZIndex;

        const rect = objetoFlutuanteArrastado.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;

        offsetObjX = clientX - rect.left;
        offsetObjY = clientY - rect.top;

        toolbarFlutuante.classList.add('escondido');
    }
};

let rafArrastoObjetoAtivo = false;

const moverObjetoFlutuante = (e) => {
    if (objetoFlutuanteArrastado) {
        if (e.type === 'touchmove') e.preventDefault();

        if (!rafArrastoObjetoAtivo) {
            // Otimização de Performance: Navegador controla os quadros (60fps)
            requestAnimationFrame(() => {
                const containerRect = caixaDeTexto.getBoundingClientRect();
                const clientX = e.touches ? e.touches[0].clientX : e.clientX;
                const clientY = e.touches ? e.touches[0].clientY : e.clientY;

                let x = clientX - containerRect.left - offsetObjX;
                let y = clientY - containerRect.top - offsetObjY;

                if (x < 0) x = 0;
                if (y < 0) y = 0;

                objetoFlutuanteArrastado.style.left = `${x}px`;
                objetoFlutuanteArrastado.style.top = `${y}px`;

                document.getElementById('toolbarObjeto')?.classList.remove('escondido');
                sincronizarToolbarArrasto(objetoFlutuanteArrastado, 'toolbarObjeto');

                rafArrastoObjetoAtivo = false;
            });
            rafArrastoObjetoAtivo = true;
        }
    }
};

const soltarObjetoFlutuante = () => {
    if (objetoFlutuanteArrastado) {
        objetoFlutuanteArrastado = null;
        salvarTextoFirebase(); // Salva as novas coordenadas no Banco de Dados instantaneamente!
    }
};

// Conecta os eventos de arrasto na Caixa de Texto (para abranger toda a folha)
caixaDeTexto.addEventListener('mousedown', iniciarArrasteObjetoFlutuante);
caixaDeTexto.addEventListener('touchstart', iniciarArrasteObjetoFlutuante, { passive: false });
document.addEventListener('mousemove', moverObjetoFlutuante);
document.addEventListener('touchmove', moverObjetoFlutuante, { passive: false });
document.addEventListener('mouseup', soltarObjetoFlutuante);
document.addEventListener('touchend', soltarObjetoFlutuante);

// --- GERADOR DO INGRESSO ---
document.getElementById('btnInserirIngresso')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;

    // CORREÇÃO: Agora o HTML nasce com as classes 'obj-flutuante' e 'drag-handle'!
    const ingressoHTML = `
        <div class="obj-flutuante ingresso-card" data-dono="${usuarioAtual.uid}" contenteditable="false" draggable="false" style="top: 150px; left: 50px; width: 280px;">
            <div class="drag-handle" title="Arraste para mover" contenteditable="false">✥ Mover</div>
            
            <svg viewBox="0 0 300 120" width="100%" xmlns="http://www.w3.org/2000/svg" style="display: block;">
                <path d="M 10 10 L 290 10 A 10 10 0 0 0 290 30 L 290 90 A 10 10 0 0 0 290 110 L 10 110 A 10 10 0 0 0 10 90 L 10 30 A 10 10 0 0 0 10 10 Z" fill="#fdfbf7" stroke="#dcd0c0" stroke-width="2"/>
                <line x1="220" y1="12" x2="220" y2="108" stroke="#dcd0c0" stroke-width="2" stroke-dasharray="4 4"/>
                <g fill="#333">
                    <rect x="240" y="25" width="4" height="70"/><rect x="246" y="25" width="2" height="70"/>
                    <rect x="250" y="25" width="6" height="70"/><rect x="260" y="25" width="3" height="70"/>
                    <rect x="265" y="25" width="5" height="70"/><rect x="272" y="25" width="2" height="70"/>
                </g>
                <text x="28" y="98" font-family="monospace" font-size="10" fill="#aaa" transform="rotate(-90 28 98)">ADMIT ONE</text>
            </svg>
            
            <div class="ingresso-texto ingresso-evento" contenteditable="true" spellcheck="false" title="Nome do evento">Cine Drive-in</div>
            <div class="ingresso-texto ingresso-data" contenteditable="true" spellcheck="false" title="Data/Hora">14/05/2026</div>
            <div class="ingresso-texto ingresso-assento" contenteditable="true" spellcheck="false" title="Lugar">Carro 03</div>
        </div>
    `;

    caixaDeTexto.insertAdjacentHTML('beforeend', ingressoHTML);
    salvarTextoFirebase();
    document.getElementById('menuStickers').classList.add('escondido');
});
// --- GERADOR DA CARTA ANIMADA ---
document.getElementById('btnInserirCarta')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
    const idUnico = 'carta_' + Date.now();

    const cartaHTML = `
        <div class="obj-flutuante carta-objeto" data-dono="${usuarioAtual.uid}" contenteditable="false" draggable="false" style="top: 150px; left: 80px; width: 250px;">
            <div class="drag-handle" title="Arraste para mover">✥ Mover</div>
            <div class="carta-container" id="${idUnico}">
                <div class="envelope-costas"></div>
                
                <div class="carta-papel">Escreva algo especial...</div>
                
                <svg class="envelope-frente" viewBox="0 0 250 160" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="0,0 100,80 0,160" fill="#eaddbd" stroke="#dcd0c0" stroke-width="1"/>
                    <polygon points="250,0 150,80 250,160" fill="#eaddbd" stroke="#dcd0c0" stroke-width="1"/>
                    <polygon points="0,160 125,95 250,160" fill="#f4e5c5" stroke="#dcd0c0" stroke-width="1"/>
                </svg>
                
                <svg class="envelope-aba" viewBox="0 0 250 160" xmlns="http://www.w3.org/2000/svg">
                    <polygon points="0,0 125,100 250,0" fill="#fdf5db" stroke="#cbbca5" stroke-width="2"/>
                </svg>
                
                <div class="selo-cera" title="Abrir Carta" onclick="window.animarElerCarta('${idUnico}')"></div>
            </div>
        </div>
    `;
    caixaDeTexto.insertAdjacentHTML('beforeend', cartaHTML);
    salvarTextoFirebase(); document.getElementById('menuStickers').classList.add('escondido');
});

// --- GERADOR DA RASPADINHA ---
document.getElementById('btnInserirRaspadinha')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;

    const raspHTML = `
        <div class="obj-flutuante raspadinha-objeto" data-dono="${usuarioAtual.uid}" contenteditable="false" draggable="false" style="top: 150px; left: 80px; width: 260px;">
            <div class="drag-handle" title="Arraste para mover">✥ Mover</div>
            <div class="raspadinha-container">
                <div class="raspadinha-texto">Surpresa Oculta!</div>
                <canvas class="raspadinha-canvas"></canvas>
                <img class="raspadinha-estado escondido" src=""> 
            </div>
        </div>
    `;
    caixaDeTexto.insertAdjacentHTML('beforeend', raspHTML);
    salvarTextoFirebase(); document.getElementById('menuStickers').classList.add('escondido');
    inicializarRaspadinhas();
});
// O Motor que faz a Raspadinha funcionar na tela e salvar no banco
const inicializarRaspadinhas = () => {
    document.querySelectorAll('.raspadinha-container').forEach(container => {
        const canvas = container.querySelector('.raspadinha-canvas');
        const imgEstado = container.querySelector('.raspadinha-estado');
        if (!canvas || canvas.dataset.iniciado === "true") return; // Evita duplicar eventos

        const ctx = canvas.getContext('2d');
        canvas.width = container.offsetWidth || 260;
        canvas.height = container.offsetHeight || 120;
        canvas.dataset.iniciado = "true";

        // Se já tinha sido raspada antes (veio do Firebase), restaura a imagem. Se não, pinta de prata!
        if (imgEstado && imgEstado.src && imgEstado.src.length > 50) {
            const img = new Image();
            img.onload = () => ctx.drawImage(img, 0, 0);
            img.src = imgEstado.src;
        } else {
            // Textura prateada chique
            ctx.fillStyle = '#bdc3c7'; ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#95a5a6'; ctx.font = 'bold 20px Arial'; ctx.textAlign = 'center';
            ctx.fillText('Raspadinha 🪙', canvas.width / 2, canvas.height / 2 + 5);
        }

        let raspando = false;
        const iniciarRaspar = (e) => { raspando = true; raspar(e); };
        const pararRaspar = () => {
            if (raspando) {
                raspando = false;
                // Salva o buraco prateado no HTML invisível para o Firebase sincronizar!
                imgEstado.src = canvas.toDataURL();
                salvarTextoFirebase();
            }
        };
        const raspar = (e) => {
            if (!raspando) return;
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const clientX = e.touches ? e.touches[0].clientX : e.clientX;
            const clientY = e.touches ? e.touches[0].clientY : e.clientY;

            // Lógica Sênior: Fator de escala para raspar corretamente em qualquer tamanho de bilhete!
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const x = (clientX - rect.left) * scaleX;
            const y = (clientY - rect.top) * scaleY;

            ctx.globalCompositeOperation = 'destination-out';
            ctx.beginPath(); ctx.arc(x, y, 15, 0, Math.PI * 2); ctx.fill();
        };

        canvas.addEventListener('mousedown', iniciarRaspar);
        canvas.addEventListener('mousemove', raspar);
        document.addEventListener('mouseup', pararRaspar); // Usa document para não falhar se o mouse sair

        canvas.addEventListener('touchstart', iniciarRaspar, { passive: false });
        canvas.addEventListener('touchmove', raspar, { passive: false });
        document.addEventListener('touchend', pararRaspar);
    });
};

// --- DUPLO CLIQUE (Corações) BLINDADO ---
folhaA4Wrapper?.addEventListener('dblclick', (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor' || modoDesenhoAtivo) return;
    const rect = folhaA4Wrapper.getBoundingClientRect();
    set(ref(database, `amei/${cadernoAtualId}`), { ts: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top });
}, true); // O 'true' garante que este clique seja ouvido antes de qualquer outra coisa na tela!

function soltarCoracoes(x, y) {
    if (!folhaA4Wrapper) return;
    const coracao = document.createElement('div'); const emojisAmei = ['❤️', '💖', '✨'];
    coracao.innerText = emojisAmei[Math.floor(Math.random() * emojisAmei.length)];
    coracao.className = 'animacao-amei'; coracao.style.left = `${x - 20}px`; coracao.style.top = `${y - 20}px`;
    folhaA4Wrapper.appendChild(coracao); setTimeout(() => coracao.remove(), 2000);
}

// ==========================================
// 10. PAGINAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
// ==========================================
function atualizarBotoesPaginacao() {
    const inputPag = document.getElementById('inputIrParaPagina');
    if (inputPag) {
        inputPag.value = paginaAtual;
        inputPag.max = totalPaginas;
    }

    const spanTotal = document.getElementById('totalPaginasSpan');
    if (spanTotal) spanTotal.innerText = totalPaginas;

    document.getElementById('btnPaginaAnterior').disabled = paginaAtual <= 1;
    document.getElementById('btnPaginaProxima').disabled = paginaAtual >= totalPaginas;

    const btnExcluir = document.getElementById('btnAbrirModalExcluirPag');
    if (btnExcluir) {
        if (souAdminOuDono && totalPaginas > 1) { btnExcluir.classList.remove('escondido'); }
        else { btnExcluir.classList.add('escondido'); }
    }
}

document.getElementById('btnNovaPagina')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
    totalPaginas++; update(ref(database, `cadernos/${cadernoAtualId}`), { totalPaginas: totalPaginas });
    paginaAtual = totalPaginas; carregarPaginaAtual();
});

document.getElementById('btnPaginaProxima')?.addEventListener('click', () => {
    if (paginaAtual < totalPaginas) {
        dispararSom('pagina'); // Toca o som
        paginaAtual++;
        carregarPaginaAtual();
    }
});

document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => {
    if (paginaAtual > 1) {
        dispararSom('pagina'); // Toca o som
        paginaAtual--;
        carregarPaginaAtual();
    }
});

document.getElementById('inputIrParaPagina')?.addEventListener('change', (e) => {
    let novaPag = parseInt(e.target.value);

    // Verifica se o número é válido (não é letra, não é menor que 1 e não é maior que o total)
    if (!isNaN(novaPag) && novaPag >= 1 && novaPag <= totalPaginas) {
        dispararSom('pagina'); // Toca o som de virar a página
        paginaAtual = novaPag;
        carregarPaginaAtual();
    } else {
        // Se digitar loucura (ex: pág 90 num caderno de 10), reseta pro número atual
        e.target.value = paginaAtual;
    }
});

document.getElementById('btnAbrirModalExcluirPag')?.addEventListener('click', () => { document.getElementById('modalExcluirPagina').classList.remove('escondido'); });

document.getElementById('btnConfirmarExcluirPagina')?.addEventListener('click', async () => {
    if (!souAdminOuDono || totalPaginas <= 1) return;

    const anotacoesSnap = await get(ref(database, `anotacoes/${cadernoAtualId}`));
    const stickersSnap = await get(ref(database, `stickers/${cadernoAtualId}`));
    const desenhosSnap = await get(ref(database, `desenhos/${cadernoAtualId}`));
    let anotacoes = anotacoesSnap.val() || {}; let stickers = stickersSnap.val() || {}; let desenhos = desenhosSnap.val() || {};

    for (let i = paginaAtual; i < totalPaginas; i++) {
        anotacoes[`pagina_${i}`] = anotacoes[`pagina_${i + 1}`] || null;
        stickers[`pagina_${i}`] = stickers[`pagina_${i + 1}`] || null;
        desenhos[`pagina_${i}`] = desenhos[`pagina_${i + 1}`] || null;
    }

    anotacoes[`pagina_${totalPaginas}`] = null; stickers[`pagina_${totalPaginas}`] = null; desenhos[`pagina_${totalPaginas}`] = null;

    await update(ref(database, `anotacoes/${cadernoAtualId}`), anotacoes);
    await update(ref(database, `stickers/${cadernoAtualId}`), stickers);
    await update(ref(database, `desenhos/${cadernoAtualId}`), desenhos);

    const novoTotal = totalPaginas - 1;
    await update(ref(database, `cadernos/${cadernoAtualId}`), { totalPaginas: novoTotal });

    if (paginaAtual > novoTotal) paginaAtual = novoTotal;
    document.getElementById('modalExcluirPagina').classList.add('escondido');
    carregarPaginaAtual();
});

// ==========================================
// MODO LEITURA (Estilo Obsidian)
// ==========================================
document.getElementById('btnToggleLeitura')?.addEventListener('click', (e) => {
    if (minhaPermissaoAtual === 'leitor') return; // Se for leitor fixo, ignora

    modoLeituraAtivo = !modoLeituraAtivo;
    const btn = e.target;

    if (modoLeituraAtivo) {
        btn.innerHTML = '✏️ Edição';
        btn.style.backgroundColor = '#607d8b'; // Cor neutra/foco
        btn.style.color = '#fff';

        caixaDeTexto.contentEditable = false;
        folhaA4Wrapper.classList.add('modo-leitura-ativo'); // Gatilho pro CSS

        // Esconde todas as toolbars flutuantes ativas
        toolbarFlutuante.classList.add('escondido');
        toolbarImagem.classList.add('escondido');
        document.getElementById('toolbarObjeto')?.classList.add('escondido');
        toolbarSticker.classList.add('escondido');

        // Solta qualquer coisa que estivesse selecionada
        imagemSelecionada = null; objetoFlutuanteArrastado = null; stickerSelecionado = null;
        if (window.mostrarToast) window.mostrarToast("Modo Leitura: Toques acidentais bloqueados", "📖");
    } else {
        btn.innerHTML = '📖 Leitura';
        btn.style.backgroundColor = ''; // Volta ao padrão
        btn.style.color = '';

        caixaDeTexto.contentEditable = true;
        folhaA4Wrapper.classList.remove('modo-leitura-ativo');
        if (window.mostrarToast) window.mostrarToast("Modo Edição: Você já pode alterar a página", "✏️");
    }
});

function carregarPaginaAtual() {
    atualizarBotoesPaginacao();
    if (cadernoAtualId && usuarioAtual) {
        update(ref(database, `leituras/${cadernoAtualId}/${usuarioAtual.uid}`), {
            nome: nomeExibicaoAtual,
            paginaLendo: paginaAtual,
            tsLeitura: Date.now()
        });
    }
    // Mantém a presença atualizada
    if (refMinhaPresenca) {
        update(refMinhaPresenca, { paginaLendo: paginaAtual });
    }

    if (escutaAnotacoes) escutaAnotacoes(); if (escutaStickers) escutaStickers(); if (escutaDesenhos) escutaDesenhos();
    ajustarTamanhoCanvas();
    ajustarTamanhoCanvas();
    if (ctxDesenho) ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);

    escutaAnotacoes = onValue(ref(database, `anotacoes/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        const d = snapshot.val() || {};
        notificarNovoConteudo("A página foi atualizada!");
        const camadaCapsula = document.getElementById('camadaCapsula');

        if (d.bloqueadoAte && d.bloqueadoAte > Date.now()) {
            caixaDeTexto.innerHTML = ''; caixaDeTexto.contentEditable = false;
            if (camadaCapsula) {
                camadaCapsula.classList.remove('escondido');
                document.getElementById('dataAberturaCapsula').innerText = new Date(d.bloqueadoAte).toLocaleDateString('pt-BR');
            }
        } else {
            if (camadaCapsula) camadaCapsula.classList.add('escondido');

            // Impede o navegador de bugar o cursor mudando a propriedade sem necessidade
            const estadoDesejado = (minhaPermissaoAtual !== 'leitor' && !modoLeituraAtivo) ? "true" : "false";
            if (caixaDeTexto.contentEditable !== estadoDesejado) {
                caixaDeTexto.contentEditable = estadoDesejado;
            }
            // Se você estiver só olhando a página, você recebe o texto do seu amigo na hora!
            if (!euEstouDigitando && caixaDeTexto.innerHTML !== (d.texto || '')) {
                caixaDeTexto.innerHTML = d.texto || '';
            }
        }
    });

    escutaStickers = onValue(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        const areaStickers = document.getElementById('areaStickers');
        if (!areaStickers) return;

        const idsNoBanco = [];

        snapshot.forEach(filho => {
            const id = filho.key;
            const d = filho.val();
            idsNoBanco.push(id);

            // Procura se o sticker já existe na tela
            let div = areaStickers.querySelector(`.sticker[data-id="${id}"]`);

            // Se não existir, cria ele
            if (!div) {
                div = document.createElement('div');
                div.className = 'sticker';
                div.setAttribute('data-id', id);
                areaStickers.appendChild(div);
            }

            // ATUALIZA as propriedades SEM destruir o elemento (Isso salva a Toolbar!)
            div.innerText = d.emoji;
            div.style.left = `${d.x}px`;
            div.style.top = `${d.y}px`;
            div.setAttribute('data-rot', d.rot || 0);
            div.style.transform = `rotate(${d.rot || 0}deg)`;

            // Se este for o sticker que está selecionado, manda a barra grudar nele de novo!
            if (stickerSelecionado && stickerSelecionado.getAttribute('data-id') === id) {
                sincronizarToolbarArrasto(div, 'toolbarSticker');
            }
        });

        // Limpeza inteligente: Remove da tela apenas os stickers que foram apagados no Firebase
        Array.from(areaStickers.children).forEach(el => {
            if (!idsNoBanco.includes(el.getAttribute('data-id'))) {
                el.remove();
            }
        });
    });

    escutaDesenhos = onValue(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        if (desenhando) return;
        const d = snapshot.val();
        ajustarTamanhoCanvas(); // Redimensiona SEM preservar (o Firebase vai fornecer a imagem certa)
        if (d && d.img && ctxDesenho) {
            const img = new Image();
            img.onload = () => {
                ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);
                ctxDesenho.drawImage(img, 0, 0);
            };
            img.src = d.img;
        } else if (ctxDesenho) {
            ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);
        }
    });
    setTimeout(inicializarRaspadinhas, 200);
}

// ==========================================
// 11. MÚSICA, PRESENÇA E ROTINAS
// ==========================================
// --- MÚSICA COM PLACEHOLDER E URL DO SPOTIFY CORRIGIDA ---
function embedMusica(link) {
    const divContainer = document.getElementById('containerMusica');
    const divWidget = document.getElementById('widgetMusica');
    if (!divContainer || !divWidget) return;

    // Garante que o painel de música apareça
    divContainer.classList.remove('escondido');

    if (!link) {
        divWidget.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--texto-secundario); font-size: 14px;">Nenhuma música configurada. Vá na engrenagem ⚙️ do caderno para adicionar!</div>';
        return;
    }

    try {
        if (link.includes('spotify.com')) {
            const urlObj = new URL(link);
            const pathSegments = urlObj.pathname.split('/').filter(p => p);
            if (pathSegments.length >= 2) {
                // Pegando as duas últimas partes (tipo e id) da URL limpa do Spotify
                const tipo = pathSegments[pathSegments.length - 2];
                const id = pathSegments[pathSegments.length - 1];
                divWidget.innerHTML = `<iframe src="https://open.spotify.com/embed/${tipo}/${id}?utm_source=generator&theme=0" width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
            }
        } else if (link.includes('youtube.com') || link.includes('youtu.be')) {
            let idVideo = link.includes('youtu.be') ? link.split('youtu.be/')[1].split('?')[0] : new URL(link).searchParams.get('v');
            divWidget.innerHTML = `<iframe width="100%" height="200" src="https://www.youtube.com/embed/${idVideo}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
            divWidget.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--texto-secundario); font-size: 14px;">Link de música não suportado. Use Spotify ou YouTube.</div>';
        }
    } catch (e) {
        divWidget.innerHTML = '<div style="padding: 20px; text-align: center; color: var(--texto-secundario); font-size: 14px;">Erro ao carregar música.</div>';
    }
}

function iniciarRotinasDoCaderno() {
    if (!cadernoAtualId) return;

    if (escutaTarefas) escutaTarefas(); if (escutaTotalPaginas) escutaTotalPaginas();
    if (escutaPresenca) escutaPresenca(); if (escutaAmei) escutaAmei();

    refMinhaPresenca = ref(database, `presenca/${cadernoAtualId}/${usuarioAtual.uid}`);
    set(refMinhaPresenca, { nome: nomeExibicaoAtual, foto: document.getElementById('avatarDashboard').src, online: true });
    onDisconnect(refMinhaPresenca).remove();

    // --- RECEBEDOR DE PRESENÇA (Apenas Avatares e Mouse) ---
    escutaPresenca = onValue(ref(database, `presenca/${cadernoAtualId}`), (snap) => {
        const areaOnline = document.getElementById('areaUsuariosOnline');
        areaOnline.innerHTML = '';
        document.querySelectorAll('.cursor-alheio').forEach(c => c.remove());

        if (snap.exists()) {
            snap.forEach(filho => {
                const uid = filho.key;
                const dados = filho.val();

                let humorBadge = dados.humor ? `<div class="humor-badge">${dados.humor}</div>` : '';

                // Verifica se o usuário está digitando e adiciona a animação de "digitando..." se for o caso
                let digitandoIndicador = (dados.digitando && uid !== usuarioAtual?.uid)
                    ? `<div class="status-digitando" title="${dados.nome} está escrevendo...">💬</div>`
                    : '';

                areaOnline.innerHTML += `
                    <div class="avatar-presenca" title="${dados.nome}">
                        <img src="${dados.foto}">
                        <div class="dot-verde"></div>
                        ${humorBadge}
                        ${digitandoIndicador}
                    </div>`;

                if (uid !== usuarioAtual?.uid) {
                    // Renderiza o Cursor Flutuante
                    if (dados.cursorX != null && dados.cursorY != null) {
                        const cursorDiv = document.createElement('div');
                        cursorDiv.className = 'cursor-alheio';
                        cursorDiv.style.transform = `translate(${dados.cursorX}px, ${dados.cursorY}px)`;
                        cursorDiv.innerHTML = `<svg viewBox="0 0 16 16" fill="currentColor" style="color: #e91e63;"><path d="M0 0l16 6-6 1.5L8.5 16 0 0z" stroke="white" stroke-width="2" stroke-linejoin="round"/></svg><div class="cursor-nome">${dados.nome.split(' ')[0]}</div>`;
                        folhaA4Wrapper.appendChild(cursorDiv);
                    }
                }
            });
        }
    });

    // --- NOVO: RECEBEDOR DO VISTO POR ÚLTIMO (Memória Permanente) ---
    onValue(ref(database, `leituras/${cadernoAtualId}`), (snap) => {
        let textoVisto = "";
        if (snap.exists()) {
            snap.forEach(filho => {
                const uid = filho.key;
                const dados = filho.val();

                if (uid !== usuarioAtual.uid && dados.paginaLendo === paginaAtual && dados.tsLeitura) {
                    const dataLeitura = new Date(dados.tsLeitura);
                    const hoje = new Date();
                    const ehHoje = dataLeitura.getDate() === hoje.getDate() && dataLeitura.getMonth() === hoje.getMonth();
                    const hora = dataLeitura.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
                    const diaStr = ehHoje ? "hoje" : dataLeitura.toLocaleDateString('pt-BR');

                    textoVisto += `👁️ Lida por ${dados.nome.split(' ')[0]} ${diaStr} às ${hora}. `;
                }
            });
        }
        document.getElementById('vistoPorUltimo').innerText = textoVisto || "Só você leu esta página ainda.";
    });

    let ultimoAmeiTempo = 0;
    escutaAmei = onValue(ref(database, `amei/${cadernoAtualId}`), (snap) => {
        const val = snap.val(); if (val && val.ts > ultimoAmeiTempo) { ultimoAmeiTempo = val.ts; soltarCoracoes(val.x, val.y); }
    });

    escutaTotalPaginas = onValue(ref(database, `cadernos/${cadernoAtualId}/totalPaginas`), (snapshot) => {
        if (snapshot.exists()) { totalPaginas = snapshot.val(); atualizarBotoesPaginacao(); }
    });

    onValue(ref(database, `cadernos/${cadernoAtualId}`), (snapshot) => {
        const d = snapshot.val();
        if (d) {
            document.getElementById('tituloCadernoAtual').innerText = d.titulo;
            const config = d.config || {};
            if (folhaA4Wrapper) {
                folhaA4Wrapper.className = `folha-a4 ${config.fonte || 'fonte-padrao'} ${config.fundo || 'fundo-limpo'}`;
            }
            document.getElementById('tituloCadernoAtual').className = config.fonte || 'fonte-padrao';
            embedMusica(config.musica);

            if (d.clima) {
                document.querySelectorAll('.btn-humor').forEach(b => {
                    b.classList.toggle('ativo', b.getAttribute('data-humor') === d.clima);
                });
            }
        }
    });

    escutaTarefas = onValue(ref(database, `tarefas/${cadernoAtualId}`), (snapshot) => {
        const listaTarefasUi = document.getElementById('listaTarefas'); listaTarefasUi.innerHTML = '';
        snapshot.forEach((filho) => {
            const id = filho.key; const d = filho.val(); const li = document.createElement('li');
            li.setAttribute('data-id', id);

            const chk = document.createElement('input'); chk.type = 'checkbox'; chk.checked = d.concluida; chk.style.width = "auto";
            if (minhaPermissaoAtual === 'leitor') chk.disabled = true;
            else chk.addEventListener('change', () => { update(ref(database, `tarefas/${cadernoAtualId}/${id}`), { concluida: chk.checked }); });

            const span = document.createElement('span'); span.className = 'texto-tarefa'; span.innerText = d.texto; if (d.concluida) span.classList.add('tarefa-concluida');
            li.appendChild(chk); li.appendChild(span);

            if (minhaPermissaoAtual !== 'leitor') {
                const btnE = document.createElement('button'); btnE.innerText = '✏️'; btnE.className = 'btn-pequeno';
                btnE.addEventListener('click', () => { tarefaSendoEditadaId = id; document.getElementById('inputEdicaoTarefa').value = d.texto; document.getElementById('modalEditarTarefa').classList.remove('escondido'); });
                const btnX = document.createElement('button'); btnX.innerText = '🗑️'; btnX.className = 'btn-pequeno';
                btnX.addEventListener('click', () => { tarefaSendoApagadaId = id; document.getElementById('textoTarefaApagar').innerText = `"${d.texto}"`; document.getElementById('modalApagarTarefa').classList.remove('escondido'); });
                li.appendChild(btnE); li.appendChild(btnX);
            }
            listaTarefasUi.appendChild(li);
        });

        habilitarReordenacaoTarefas('listaTarefas');
    });

    document.querySelectorAll('.btn-humor').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!cadernoAtualId) return;
            const emoji = e.target.getAttribute('data-humor');
            update(ref(database, `presenca/${cadernoAtualId}/${usuarioAtual.uid}`), { humor: emoji });
            update(ref(database, `cadernos/${cadernoAtualId}`), { clima: emoji });
            document.querySelectorAll('.btn-humor').forEach(b => b.classList.remove('ativo'));
            e.target.classList.add('ativo');
        });
    });

    // A MÁGICA DOS EVENTOS: Chama a escuta das contagens múltiplas
    escutarContagens();

    // --- TRANSMISSOR DE CURSOR (Figma Effect) ---
    let ultimoEnvioMouse = 0;
    folhaA4Wrapper?.addEventListener('mousemove', (e) => {
        if (!cadernoAtualId || !refMinhaPresenca) return;

        const agora = Date.now();
        if (agora - ultimoEnvioMouse > 100) {
            const rect = folhaA4Wrapper.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;

            update(refMinhaPresenca, { cursorX: x, cursorY: y });
            ultimoEnvioMouse = agora;
        }
    });

    folhaA4Wrapper?.addEventListener('mouseleave', () => {
        if (refMinhaPresenca) update(refMinhaPresenca, { cursorX: null, cursorY: null });
    });
}

// ==========================================
// MOTOR DE REORDENAÇÃO DE TAREFAS (Long Press)
// ==========================================
const habilitarReordenacaoTarefas = (idListaUl) => {
    const lista = document.getElementById(idListaUl);
    if (!lista) return;

    let timerSegurar;
    let itemArrastado = null;
    let posYInicial = 0;

    // Configura os itens
    Array.from(lista.children).forEach(item => {
        item.classList.add('tarefa-item');

        const iniciarPressao = (e) => {
            if (minhaPermissaoAtual === 'leitor') return;

            // Inicia o cronômetro de 400ms
            timerSegurar = setTimeout(() => {
                itemArrastado = item;
                item.classList.add('tarefa-pronta-arrasto');

                // Vibração tátil sutil para mobile
                if (navigator.vibrate) navigator.vibrate(50);

                // Previne o menu de contexto padrão no mobile
                e.preventDefault();
            }, 400);
        };

        const cancelarPressao = () => clearTimeout(timerSegurar);

        // Listeners
        item.addEventListener('mousedown', iniciarPressao);
        item.addEventListener('touchstart', iniciarPressao, { passive: false });

        item.addEventListener('mouseup', cancelarPressao);
        item.addEventListener('mouseleave', cancelarPressao);
        item.addEventListener('touchend', cancelarPressao);
    });

    // Movimentação global
    const moverTarefa = (e) => {
        if (!itemArrastado) return;
        e.preventDefault(); // Trava scroll da tela enquanto arrasta a tarefa

        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        const irmaos = Array.from(lista.querySelectorAll('.tarefa-item:not(.tarefa-pronta-arrasto)'));

        // Acha o irmão mais próximo com base na posição do Y
        const irmaoProximo = irmaos.find(irmao => {
            const rect = irmao.getBoundingClientRect();
            return clientY < rect.top + (rect.height / 2);
        });

        if (irmaoProximo) {
            lista.insertBefore(itemArrastado, irmaoProximo);
        } else {
            lista.appendChild(itemArrastado);
        }
    };

    const soltarTarefa = () => {
        if (itemArrastado) {
            itemArrastado.classList.remove('tarefa-pronta-arrasto');
            itemArrastado = null;

            // SALVANDO A NOVA ORDEM NO FIREBASE
            if (cadernoAtualId && minhaPermissaoAtual !== 'leitor') {
                const novasTarefas = {};
                const listaUl = document.getElementById(idListaUl);

                // O Firebase ordena os itens pela chave (ID). 
                // Usamos a função nativa push() para gerar novos IDs na ordem correta do DOM.
                Array.from(listaUl.children).forEach((li) => {
                    const texto = li.querySelector('.texto-tarefa').innerText;
                    const concluida = li.querySelector('input[type="checkbox"]').checked;

                    const novaChaveCrono = push(ref(database, 'dummy')).key;
                    novasTarefas[novaChaveCrono] = { texto: texto, concluida: concluida };
                });

                // Substitui a lista inteira no banco com a ordem perfeita
                set(ref(database, `tarefas/${cadernoAtualId}`), novasTarefas);
            }
        }
    };

    document.addEventListener('mousemove', moverTarefa);
    document.addEventListener('touchmove', moverTarefa, { passive: false });
    document.addEventListener('mouseup', soltarTarefa);
    document.addEventListener('touchend', soltarTarefa);
};

// ==========================================
// 12. EXPORTAÇÃO PARA PDF
// ==========================================
document.getElementById('btnExportarPDF')?.addEventListener('click', async () => {
    try {
        window.scrollTo(0, 0);

        const divLoading = document.createElement('div');
        divLoading.style.position = 'fixed'; divLoading.style.top = '0'; divLoading.style.left = '0'; divLoading.style.width = '100%'; divLoading.style.height = '100%'; divLoading.style.backgroundColor = 'rgba(0,0,0,0.8)'; divLoading.style.color = 'white'; divLoading.style.display = 'flex'; divLoading.style.justifyContent = 'center'; divLoading.style.alignItems = 'center'; divLoading.style.zIndex = '9999'; divLoading.style.fontSize = '24px';
        divLoading.innerHTML = "Gerando PDF com amor... Aguarde as fotos carregarem! 📸";
        document.body.appendChild(divLoading);

        const configAtualSnap = await get(ref(database, `cadernos/${cadernoAtualId}/config`));
        const config = configAtualSnap.val() || {};
        const classeFonte = config.fonte || 'fonte-padrao';
        const classeFundo = config.fundo || 'fundo-limpo';

        const tituloCaderno = document.getElementById('tituloCadernoAtual').innerText;

        const salaEscura = document.createElement('div');
        salaEscura.style.cssText = `
            position: fixed;
            top: -99999px;
            left: 0;
            width: 800px;
            z-index: 9999;
            background-color: #ffffff;
        `;
        document.body.appendChild(salaEscura);

        const capa = document.createElement('div');
        capa.innerHTML = `<h1 style="text-align: center; border-bottom: 2px solid #333; padding: 40px 0; margin-bottom: 30px; color: #111;">${tituloCaderno}</h1>`;
        salaEscura.appendChild(capa);

        const anotacoesSnap = await get(ref(database, `anotacoes/${cadernoAtualId}`));
        const stickersSnap = await get(ref(database, `stickers/${cadernoAtualId}`));
        const desenhosSnap = await get(ref(database, `desenhos/${cadernoAtualId}`));

        const todasAnotacoes = anotacoesSnap.val() || {};
        const todosStickers = stickersSnap.val() || {};
        const todosDesenhos = desenhosSnap.val() || {};

        for (let i = 1; i <= totalPaginas; i++) {
            const folha = document.createElement('div');
            folha.className = `folha-a4 ${classeFonte} ${classeFundo}`;
            folha.style.color = '#111'; folha.style.backgroundColor = classeFundo === 'fundo-limpo' ? '#ffffff' : '#fdfbf7';
            folha.style.border = 'none'; folha.style.boxShadow = 'none'; folha.style.padding = '40px'; folha.style.minHeight = '1000px';
            folha.style.position = 'relative'; folha.style.pageBreakAfter = 'always';

            const anotacaoData = todasAnotacoes[`pagina_${i}`] || {};

            if (anotacaoData.bloqueadoAte && anotacaoData.bloqueadoAte > Date.now()) {
                folha.innerHTML = `<div style="text-align: center; padding-top: 200px;"><h2>🔒 Cápsula do Tempo</h2><p>Página bloqueada até ${new Date(anotacaoData.bloqueadoAte).toLocaleDateString('pt-BR')}</p></div>`;
            } else {
                const divTexto = document.createElement('div');
                divTexto.className = 'editor-rico';
                divTexto.style.border = 'none'; divTexto.style.padding = '0'; divTexto.style.minHeight = 'auto';
                divTexto.innerHTML = anotacaoData.texto || "<em>Página em branco.</em>";
                folha.appendChild(divTexto);

                const desenhoDaPagina = todosDesenhos[`pagina_${i}`];
                if (desenhoDaPagina && desenhoDaPagina.img) {
                    const imgDesenho = document.createElement('img');
                    imgDesenho.src = desenhoDaPagina.img;
                    imgDesenho.style.position = 'absolute'; imgDesenho.style.top = '0'; imgDesenho.style.left = '0';
                    imgDesenho.style.width = '100%'; imgDesenho.style.height = '100%'; imgDesenho.style.zIndex = '5';
                    folha.appendChild(imgDesenho);
                }

                const stickersDaPagina = todosStickers[`pagina_${i}`] || {};
                const divStickers = document.createElement('div');
                divStickers.className = 'area-stickers';
                for (let key in stickersDaPagina) {
                    const s = stickersDaPagina[key];
                    const divS = document.createElement('div');
                    divS.className = 'sticker'; divS.innerText = s.emoji;
                    divS.style.left = `${s.x}px`; divS.style.top = `${s.y}px`;
                    divS.style.transform = `rotate(${s.rot || 0}deg)`;
                    divStickers.appendChild(divS);
                }
                folha.appendChild(divStickers);
            }
            salaEscura.appendChild(folha);
        }

        const tarefasArray = [];
        document.querySelectorAll('#listaTarefas li').forEach(li => {
            const texto = li.querySelector('.texto-tarefa').innerText;
            const taMarcada = li.querySelector('input[type="checkbox"]').checked;
            tarefasArray.push(`<li style="margin-bottom: 5px;">${taMarcada ? '✅' : '🔲'} ${texto}</li>`);
        });

        if (tarefasArray.length > 0) {
            const divPlanos = document.createElement('div');
            divPlanos.style.padding = '40px'; divPlanos.style.fontFamily = 'Arial, sans-serif';
            divPlanos.innerHTML = `<h2 style="color: #ff9800; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Nossos Planos / Metas:</h2><ul style="list-style: none; padding: 0; font-size: 18px; line-height: 1.8; color: #111;">${tarefasArray.join('')}</ul>`;
            salaEscura.appendChild(divPlanos);
        }

        setTimeout(() => {
            html2pdf().set({
                margin: 10, filename: `${tituloCaderno}.pdf`, image: { type: 'jpeg', quality: 1 },
                html2canvas: { scale: 2, useCORS: true, windowWidth: 800 }, jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
            }).from(salaEscura).save().then(() => {
                document.body.removeChild(salaEscura); document.body.removeChild(divLoading);
            }).catch(err => {
                alert("Problema ao gerar PDF."); document.body.removeChild(salaEscura); document.body.removeChild(divLoading);
            });
        }, 1500);

    } catch (erroGeral) {
        alert("Erro ao processar o PDF.");
    }
});

// ==========================================
// WIDGET DE CONTAGEM REGRESSIVA MÚLTIPLA
// ==========================================
let intervalosContagem = [];

document.getElementById('btnAdicionarContagem')?.addEventListener('click', () => {
    if (minhaPermissaoAtual === 'leitor') return;
    document.getElementById('inputTituloContagem').value = '';
    document.getElementById('inputDataContagem').value = '';
    document.getElementById('modalConfigContagem').classList.remove('escondido');
});

document.getElementById('btnSalvarContagem')?.addEventListener('click', async () => {
    if (!cadernoAtualId) return;
    const titulo = document.getElementById('inputTituloContagem').value.trim();
    const dataHora = document.getElementById('inputDataContagem').value;

    if (titulo && dataHora) {
        const timestamp = new Date(dataHora).getTime();
        // Agora salva numa coleção 'contagens' (no plural)
        await push(ref(database, `contagens/${cadernoAtualId}`), { titulo: titulo, alvo: timestamp });
        document.getElementById('modalConfigContagem').classList.add('escondido');
    }
});

function escutarContagens() {
    onValue(ref(database, `contagens/${cadernoAtualId}`), (snap) => {
        const listaUI = document.getElementById('listaContagens');
        if (!listaUI) return;
        listaUI.innerHTML = '';

        // Limpa os relógios velhos
        intervalosContagem.forEach(clearInterval);
        intervalosContagem = [];

        if (snap.exists()) {
            snap.forEach((filho) => {
                const id = filho.key;
                const d = filho.val();

                const divContagem = document.createElement('div');
                divContagem.style.background = 'var(--bg-fundo)';
                divContagem.style.padding = '10px 15px';
                divContagem.style.borderRadius = '8px';
                divContagem.style.border = '1px solid var(--borda)';
                divContagem.style.position = 'relative';

                const btnExcluir = document.createElement('button');
                btnExcluir.innerText = '🗑️';
                btnExcluir.className = 'btn-pequeno btn-sair';
                btnExcluir.style.position = 'absolute';
                btnExcluir.style.top = '5px';
                btnExcluir.style.right = '5px';
                btnExcluir.style.padding = '2px 5px';
                if (minhaPermissaoAtual === 'leitor') btnExcluir.style.display = 'none';
                btnExcluir.onclick = () => remove(ref(database, `contagens/${cadernoAtualId}/${id}`));

                const divTitulo = document.createElement('div');
                divTitulo.innerText = d.titulo;
                divTitulo.style.fontSize = '13px';
                divTitulo.style.fontWeight = 'bold';
                divTitulo.style.color = 'var(--texto-secundario)';
                divTitulo.style.marginBottom = '5px';
                divTitulo.style.paddingRight = '25px'; // Espaço pro botão excluir

                const divDisplay = document.createElement('div');
                divDisplay.style.fontSize = '22px';
                divDisplay.style.fontWeight = 'bold';
                divDisplay.style.color = '#e91e63';
                divDisplay.style.fontFamily = 'monospace';
                divDisplay.innerText = '--:--:--';

                divContagem.appendChild(btnExcluir);
                divContagem.appendChild(divTitulo);
                divContagem.appendChild(divDisplay);
                listaUI.appendChild(divContagem);

                // O relógio deste evento específico
                const inter = setInterval(() => {
                    const agora = Date.now();
                    const dist = d.alvo - agora;

                    if (dist < 0) {
                        divDisplay.innerText = "🎉 CHEGOU!";

                        if (dist > -2000) {
                            dispararSom('camera'); // 📸 Toca o somzinho!
                            if (Notification.permission === 'granted') {
                                new Notification("🎉 Chegou o momento!", {
                                    body: `O evento "${d.titulo}" acabou de zerar!`,
                                    icon: 'https://cdn-icons-png.flaticon.com/512/3238/3238015.png'
                                });
                            }
                        }

                        clearInterval(inter);
                        return;
                    }

                    const dias = Math.floor(dist / (1000 * 60 * 60 * 24));
                    const horas = Math.floor((dist % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
                    const min = Math.floor((dist % (1000 * 60 * 60)) / (1000 * 60));
                    const seg = Math.floor((dist % (1000 * 60)) / 1000);

                    divDisplay.innerText = `${dias}d ${horas}h ${min}m ${seg}s`;
                }, 1000);

                intervalosContagem.push(inter);
            });
        } else {
            listaUI.innerHTML = '<div style="text-align: center; font-size: 13px; color: var(--texto-secundario); padding: 10px;">Nenhum evento definido.</div>';
        }
    });
}

// ==========================================
// CARIMBO DE PASSAPORTE
// ==========================================
document.getElementById('btnInserirCarimbo')?.addEventListener('click', () => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;
    document.getElementById('inputLocalCarimbo').value = '';
    document.getElementById('inputDataCarimbo').value = '';
    document.getElementById('modalCarimboPassaporte').classList.remove('escondido');
    document.getElementById('menuStickers').classList.add('escondido');
});

document.getElementById('btnGerarCarimbo')?.addEventListener('click', () => {
    const local = document.getElementById('inputLocalCarimbo').value.trim() || 'Desconhecido';
    const dataRaw = document.getElementById('inputDataCarimbo').value;
    // Formata a data bonitinha (Ex: 15/05/2026)
    const dataFormatada = dataRaw ? new Date(dataRaw + "T12:00:00").toLocaleDateString('pt-BR') : 'Sem data';

    // Sorteia uma leve rotação para o carimbo parecer batido à mão
    const rotacaoSorteada = Math.floor(Math.random() * 40) - 20; // Entre -20deg e +20deg

    const carimboHTML = `
        <div class="obj-flutuante" data-dono="${usuarioAtual.uid}" contenteditable="false" draggable="false" style="top: 200px; left: 100px; width: 180px; --rot: ${rotacaoSorteada}deg;">
            <div class="drag-handle" title="Arraste para mover" contenteditable="false">✥ Mover</div>
            <div class="carimbo-objeto">
                <div class="carimbo-icone">✈️</div>
                <div class="carimbo-local">${local}</div>
                <div class="carimbo-data">${dataFormatada}</div>
            </div>
        </div>
    `;

    caixaDeTexto.insertAdjacentHTML('beforeend', carimboHTML);
    salvarTextoFirebase();
    document.getElementById('modalCarimboPassaporte').classList.add('escondido');
});

// ==========================================
// MOTOR DE GESTOS MOBILE (Pinch-to-Zoom e Rotação)
// ==========================================
let pinchElemento = null;
let distInicial = 0;
let anguloInicial = 0;
let larguraInicialObj = 0;
let rotacaoInicialObj = 0;

caixaDeTexto.addEventListener('touchstart', (e) => {
    if (modoLeituraAtivo || minhaPermissaoAtual === 'leitor') return;

    // Detecta exatos 2 dedos na tela
    if (e.touches.length === 2) {
        // Busca se o toque acertou algum objeto manipulável
        pinchElemento = e.target.closest('.obj-flutuante') || e.target.closest('.polaroid') || e.target.closest('img');

        if (pinchElemento) {
            e.preventDefault(); // Evita dar zoom na página do Chrome/Safari
            toolbarFlutuante.classList.add('escondido');
            toolbarImagem.classList.add('escondido');
            document.getElementById('toolbarObjeto')?.classList.add('escondido');

            const t1 = e.touches[0];
            const t2 = e.touches[1];

            // Teorema de Pitágoras para a distância (Zoom)
            distInicial = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);

            // Arco Tangente para o ângulo (Rotação)
            anguloInicial = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);

            // Coleta os valores iniciais do CSS
            if (pinchElemento.classList.contains('obj-flutuante')) {
                larguraInicialObj = parseInt(pinchElemento.style.width) || 280;
                rotacaoInicialObj = parseInt(pinchElemento.getAttribute('data-rot')) || 0;
            } else {
                larguraInicialObj = parseInt(pinchElemento.style.maxWidth) || 45; // Em % para Polaroids
            }
        }
    }
}, { passive: false });

caixaDeTexto.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2 && pinchElemento) {
        e.preventDefault(); // Trava o scroll da tela inteira

        requestAnimationFrame(() => {
            const t1 = e.touches[0];
            const t2 = e.touches[1];

            const distAtual = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
            const anguloAtual = Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * (180 / Math.PI);

            const escala = distAtual / distInicial;

            if (pinchElemento.classList.contains('obj-flutuante')) {
                // Manipulação de Objetos Flutuantes (Ingressos, Cartas) em Pixels e Graus
                let novaLargura = larguraInicialObj * escala;
                if (novaLargura < 150) novaLargura = 150; // Limite Mínimo
                if (novaLargura > 800) novaLargura = 800; // Limite Máximo

                const diffRotacao = anguloAtual - anguloInicial;
                const novaRotacao = rotacaoInicialObj + diffRotacao;

                pinchElemento.style.width = `${novaLargura}px`;
                pinchElemento.style.setProperty('--rot', `${novaRotacao}deg`);
                pinchElemento.setAttribute('data-rot', novaRotacao);

            } else {
                // Manipulação de Polaroid (Sobe apenas a porcentagem, não rotaciona pois o CSS faz ela ficar reta)
                let novaEscalaPerc = larguraInicialObj * escala;
                if (novaEscalaPerc < 20) novaEscalaPerc = 20;
                if (novaEscalaPerc > 100) novaEscalaPerc = 100;

                pinchElemento.style.maxWidth = `${novaEscalaPerc}%`;
            }
        });
    }
}, { passive: false });

caixaDeTexto.addEventListener('touchend', (e) => {
    // Se soltou 1 ou os 2 dedos, finaliza o gesto e salva
    if (pinchElemento && e.touches.length < 2) {
        salvarTextoFirebase(); // Manda as novas proporções pro Banco
        pinchElemento = null;
    }
});

// ==========================================
// SEGURANÇA: AUTO-LOCK POR INATIVIDADE
// ==========================================
let timerInatividade;
const TEMPO_INATIVIDADE = 10 * 60 * 1000; // 10 minutos em milissegundos
let telaTrancada = false;

// Reinicia o relógio toda vez que você mexe no PC/Celular
function resetarTimerInatividade() {
    if (telaTrancada || !cadernoAtualId) return;
    clearTimeout(timerInatividade);
    timerInatividade = setTimeout(trancarPorInatividade, TEMPO_INATIVIDADE);
}

// Tranca a tela se passar de 10 minutos
async function trancarPorInatividade() {
    // Só tranca se o caderno tiver senha configurada!
    const snapConfig = await get(ref(database, `cadernos/${cadernoAtualId}/config`));
    const config = snapConfig.val() || {};

    if (config.pin && config.pin.trim() !== '') {
        telaTrancada = true;
        document.getElementById('telaBloqueioInatividade').classList.remove('escondido');
        document.getElementById('inputDesbloqueioInatividade').value = '';
        document.getElementById('msgErroDesbloqueio').innerText = '';
    }
}

// Ouve as ações do usuário (clique, mouse, teclado, toque na tela, rolagem)
['mousemove', 'keydown', 'touchstart', 'scroll', 'click'].forEach(evt => {
    document.addEventListener(evt, resetarTimerInatividade);
});

// A Lógica para Destrancar
document.getElementById('btnDesbloquearInatividade')?.addEventListener('click', async () => {
    const snapConfig = await get(ref(database, `cadernos/${cadernoAtualId}/config`));
    const config = snapConfig.val() || {};
    const tentativa = document.getElementById('inputDesbloqueioInatividade').value;

    if (tentativa === config.pin) {
        telaTrancada = false;
        document.getElementById('telaBloqueioInatividade').classList.add('escondido');
        resetarTimerInatividade(); // Volta a contar os 5 minutos
    } else {
        document.getElementById('msgErroDesbloqueio').innerText = '❌ Senha incorreta! Tente novamente.';
    }
});
