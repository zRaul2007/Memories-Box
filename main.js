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

let tarefaSendoEditadaId = null; let tarefaSendoApagadaId = null;
let escutaAnotacoes, escutaTarefas, escutaStickers, escutaDesenhos, escutaTotalPaginas, escutaPresenca, escutaAmei;
let refMinhaPresenca = null;

const telaLogin = document.getElementById('telaLogin');
const telaDashboard = document.getElementById('telaDashboard');
const telaApp = document.getElementById('telaApp');
const caixaDeTexto = document.getElementById('caixaDeTexto');
const folhaA4Wrapper = document.getElementById('folhaA4Wrapper');
const areaStickers = document.getElementById('areaStickers');
const canvasDesenho = document.getElementById('camadaDesenho');
const ctxDesenho = canvasDesenho ? canvasDesenho.getContext('2d') : null;

// ==========================================
// 2. MODO ESCURO E MODAIS GERAIS
// ==========================================
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

async function abrirCaderno(id, titulo, permissao) {
    cadernoAtualId = id;
    minhaPermissaoAtual = permissao;
    souDonoDoCadernoAtual = (permissao === 'dono');
    souAdminOuDono = (permissao === 'dono' || permissao === 'admin');

    telaDashboard.classList.add('escondido'); telaApp.classList.remove('escondido');
    document.getElementById('tituloCadernoAtual').innerText = titulo;

    if (souAdminOuDono) document.getElementById('areaControlesAdmin').classList.remove('escondido');
    else document.getElementById('areaControlesAdmin').classList.add('escondido');

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
}

// ==========================================
// 5. GESTÃO AVANÇADA DE PERMISSÕES E CONVITES
// ==========================================
document.getElementById('btnAbrirModalConvidar')?.addEventListener('click', () => { document.getElementById('modalConvidar').classList.remove('escondido'); document.getElementById('inputEmailConvite').value = ''; });

document.getElementById('btnEnviarConvite')?.addEventListener('click', async () => {
    if (!souAdminOuDono) return;
    const emailAmigo = document.getElementById('inputEmailConvite').value.trim();
    const permEscolhida = document.getElementById('selectPermissaoConvite').value;
    if (emailAmigo !== "") {
        let amigoUid = null;
        for (let uid in usuariosDb) { if (usuariosDb[uid].email === emailAmigo) amigoUid = uid; }
        if (amigoUid) {
            await push(ref(database, `convites/${amigoUid}`), { cadernoId: cadernoAtualId, tituloCaderno: document.getElementById('tituloCadernoAtual').innerText, remetenteNome: nomeExibicaoAtual, permissao: permEscolhida });
            alert("💌 Convite enviado com sucesso!"); document.getElementById('modalConvidar').classList.add('escondido');
        } else alert("❌ E-mail não encontrado. Peça para ele criar uma conta!");
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

let corCadernoEdit = "#2196F3";
const bolinhasEdit = document.querySelectorAll('#seletorCorCadernoAtual .bolinha-cor');
bolinhasEdit.forEach(b => {
    b.addEventListener('click', (e) => { bolinhasEdit.forEach(b => b.classList.remove('selecionada')); e.target.classList.add('selecionada'); corCadernoEdit = e.target.getAttribute('data-cor'); });
});

document.getElementById('btnConfigCaderno')?.addEventListener('click', async () => {
    document.getElementById('modalConfigCaderno').classList.remove('escondido');
    document.getElementById('inputEditNomeCaderno').value = document.getElementById('tituloCadernoAtual').innerText;

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

document.getElementById('btnSalvarConfigCaderno')?.addEventListener('click', async () => {
    const novoNome = document.getElementById('inputEditNomeCaderno').value.trim();
    await update(ref(database, `cadernos/${cadernoAtualId}`), { titulo: novoNome !== "" ? novoNome : document.getElementById('tituloCadernoAtual').innerText, corTema: corCadernoEdit });
    await update(ref(database, `cadernos/${cadernoAtualId}/config`), {
        fonte: document.getElementById('selectFonteCaderno').value, fundo: document.getElementById('selectFundoCaderno').value, musica: document.getElementById('inputLinkMusica').value.trim()
    });
    document.getElementById('modalConfigCaderno').classList.add('escondido');
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

caixaDeTexto.addEventListener('mousedown', (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return;

    if (e.target.tagName === 'IMG' || e.target.classList.contains('polaroid')) {
        imagemSelecionada = e.target.closest('.polaroid') || e.target;
        const coord = imagemSelecionada.getBoundingClientRect();
        toolbarImagem.style.top = `${coord.top - 10}px`; toolbarImagem.style.left = `${coord.left + (coord.width / 2)}px`;
        toolbarImagem.classList.remove('escondido'); toolbarFlutuante.classList.add('escondido'); toolbarSticker.classList.add('escondido');
    } else if (!e.target.classList.contains('polaroid-legenda')) {
        imagemSelecionada = null; toolbarImagem.classList.add('escondido');
    }
});

document.getElementById('btnImgEsq')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { imagemSelecionada.style.float = 'left'; imagemSelecionada.style.margin = '10px 15px 10px 0'; salvarTextoFirebase(); } });
document.getElementById('btnImgCentro')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { imagemSelecionada.style.float = 'none'; imagemSelecionada.style.display = 'block'; imagemSelecionada.style.margin = '15px auto'; salvarTextoFirebase(); } });
document.getElementById('btnImgDir')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { imagemSelecionada.style.float = 'right'; imagemSelecionada.style.margin = '10px 0 10px 15px'; salvarTextoFirebase(); } });
document.getElementById('btnImgAumentar')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { let l = parseInt(imagemSelecionada.style.maxWidth) || 45; if (l < 100) imagemSelecionada.style.maxWidth = (l + 10) + '%'; salvarTextoFirebase(); } });
document.getElementById('btnImgDiminuir')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { let l = parseInt(imagemSelecionada.style.maxWidth) || 45; if (l > 20) imagemSelecionada.style.maxWidth = (l - 10) + '%'; salvarTextoFirebase(); } });
document.getElementById('btnImgApagar')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (imagemSelecionada) { imagemSelecionada.remove(); toolbarImagem.classList.add('escondido'); salvarTextoFirebase(); } });

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

function salvarTextoFirebase() { if (minhaPermissaoAtual !== 'leitor') set(ref(database, `anotacoes/${cadernoAtualId}/pagina_${paginaAtual}`), { texto: caixaDeTexto.innerHTML }); }
caixaDeTexto.addEventListener('input', () => { if (cadernoAtualId && minhaPermissaoAtual !== 'leitor') salvarTextoFirebase(); });

document.getElementById('inputFoto')?.addEventListener('change', (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor') return; const arquivo = e.target.files[0]; if (!arquivo) return;
    const leitor = new FileReader();
    leitor.onload = function (evt) {
        const img = new Image();
        img.onload = function () {
            const cvs = document.createElement('canvas'); cvs.width = 400; cvs.height = img.height * (400 / img.width);
            cvs.getContext('2d').drawImage(img, 0, 0, cvs.width, cvs.height);

            const polaroidHTML = `
                <div class="polaroid" contenteditable="false" style="max-width: 45%; float: none; display: block; margin: 15px auto;">
                    <img src="${cvs.toDataURL('image/jpeg', 0.8)}" class="polaroid-img">
                    <div class="polaroid-legenda" contenteditable="true" spellcheck="false">Escreva aqui...</div>
                </div><br>
            `;
            caixaDeTexto.insertAdjacentHTML('beforeend', polaroidHTML);
            salvarTextoFirebase(); document.getElementById('inputFoto').value = '';
        }; img.src = evt.target.result;
    }; leitor.readAsDataURL(arquivo);
});

// ==========================================
// 7. LOUSA MÁGICA (CANVAS)
// ==========================================
let modoDesenhoAtivo = false;
let desenhando = false;
let modoBorracha = false;

function redimensionarCanvas() {
    if (!canvasDesenho) return;
    canvasDesenho.width = folhaA4Wrapper.offsetWidth || 800;
    canvasDesenho.height = folhaA4Wrapper.offsetHeight || 1000;
}

document.getElementById('btnModoDesenho')?.addEventListener('click', () => {
    if (minhaPermissaoAtual === 'leitor') return;
    modoDesenhoAtivo = !modoDesenhoAtivo;
    const btn = document.getElementById('btnModoDesenho');
    const btnBor = document.getElementById('btnBorracha');
    const btnLimpar = document.getElementById('btnLimparDesenho');

    if (modoDesenhoAtivo) {
        folhaA4Wrapper.classList.add('modo-desenho');
        btn.style.backgroundColor = "#f44336"; btn.innerText = "❌ Parar Desenho";
        btnBor.classList.remove('escondido'); btnLimpar.classList.remove('escondido');
        redimensionarCanvas();
        modoBorracha = false; if (ctxDesenho) ctxDesenho.globalCompositeOperation = 'source-over'; btnBor.style.backgroundColor = "#9e9e9e";
    } else {
        folhaA4Wrapper.classList.remove('modo-desenho');
        btn.style.backgroundColor = "#ff5722"; btn.innerText = "🖌️ Desenhar";
        btnBor.classList.add('escondido'); btnLimpar.classList.add('escondido');
    }
});

document.getElementById('btnBorracha')?.addEventListener('click', () => {
    modoBorracha = !modoBorracha;
    const btnBor = document.getElementById('btnBorracha');
    if (modoBorracha) {
        if (ctxDesenho) ctxDesenho.globalCompositeOperation = 'destination-out';
        btnBor.style.backgroundColor = "#4CAF50";
    } else {
        if (ctxDesenho) ctxDesenho.globalCompositeOperation = 'source-over';
        btnBor.style.backgroundColor = "#9e9e9e";
    }
});

document.getElementById('btnLimparDesenho')?.addEventListener('click', () => {
    if (confirm("Deseja apagar todos os desenhos desta página?")) {
        if (ctxDesenho) ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);
        remove(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`));
    }
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
    desenhando = true; const pos = getPosicaoCanvas(e);
    ctxDesenho.beginPath(); ctxDesenho.moveTo(pos.x, pos.y);
    ctxDesenho.strokeStyle = document.body.classList.contains('dark-mode') ? '#fff' : '#000';
    ctxDesenho.lineWidth = modoBorracha ? 20 : 3;
    ctxDesenho.lineCap = 'round';
}

function desenhar(e) {
    if (!desenhando || !modoDesenhoAtivo || !ctxDesenho) return;
    e.preventDefault(); const pos = getPosicaoCanvas(e);
    ctxDesenho.lineTo(pos.x, pos.y); ctxDesenho.stroke();
}

function pararDesenho() {
    if (desenhando && ctxDesenho) {
        desenhando = false; ctxDesenho.closePath();
        const imagemBase64 = canvasDesenho.toDataURL('image/png');
        set(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`), { img: imagemBase64 });
    }
}

if (canvasDesenho) {
    canvasDesenho.addEventListener('mousedown', iniciarDesenho); canvasDesenho.addEventListener('mousemove', desenhar);
    canvasDesenho.addEventListener('mouseup', pararDesenho); canvasDesenho.addEventListener('mouseout', pararDesenho);
    canvasDesenho.addEventListener('touchstart', iniciarDesenho); canvasDesenho.addEventListener('touchmove', desenhar);
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

areaStickers?.addEventListener('mousedown', (e) => {
    if (minhaPermissaoAtual === 'leitor') return;
    if (e.target.classList.contains('sticker')) {
        stickerArrastado = e.target; stickerSelecionado = e.target;
        const rect = stickerArrastado.getBoundingClientRect();
        offsetXSticker = e.clientX - rect.left; offsetYSticker = e.clientY - rect.top;

        toolbarSticker.style.top = `${rect.top - 15}px`; toolbarSticker.style.left = `${rect.left + (rect.width / 2)}px`;
        toolbarSticker.classList.remove('escondido'); toolbarFlutuante.classList.add('escondido'); toolbarImagem.classList.add('escondido');
    } else {
        toolbarSticker.classList.add('escondido'); stickerSelecionado = null;
    }
});

document.addEventListener('mousemove', (e) => {
    if (stickerArrastado) {
        const areaRect = areaStickers.getBoundingClientRect();
        let x = e.clientX - areaRect.left - offsetXSticker; let y = e.clientY - areaRect.top - offsetYSticker;
        stickerArrastado.style.left = `${x}px`; stickerArrastado.style.top = `${y}px`;
        toolbarSticker.classList.add('escondido');
    }
});

document.addEventListener('mouseup', () => {
    if (stickerArrastado && cadernoAtualId) {
        update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerArrastado.getAttribute('data-id')}`), { x: parseInt(stickerArrastado.style.left), y: parseInt(stickerArrastado.style.top) });
        stickerArrastado = null;
    }
});

document.getElementById('btnStickerGirarEsq')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (stickerSelecionado && cadernoAtualId) { let r = parseInt(stickerSelecionado.getAttribute('data-rot')) || 0; r -= 15; stickerSelecionado.setAttribute('data-rot', r); stickerSelecionado.style.transform = `rotate(${r}deg)`; update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`), { rot: r }); } });
document.getElementById('btnStickerGirarDir')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (stickerSelecionado && cadernoAtualId) { let r = parseInt(stickerSelecionado.getAttribute('data-rot')) || 0; r += 15; stickerSelecionado.setAttribute('data-rot', r); stickerSelecionado.style.transform = `rotate(${r}deg)`; update(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`), { rot: r }); } });
document.getElementById('btnStickerApagar')?.addEventListener('mousedown', (e) => { e.preventDefault(); if (stickerSelecionado && cadernoAtualId) { remove(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}/${stickerSelecionado.getAttribute('data-id')}`)); toolbarSticker.classList.add('escondido'); stickerSelecionado = null; } });

// --- DUPLO CLIQUE (Corações) BLINDADO ---
folhaA4Wrapper?.addEventListener('dblclick', (e) => {
    if (!cadernoAtualId || minhaPermissaoAtual === 'leitor' || modoDesenhoAtivo) return;
    const rect = folhaA4Wrapper.getBoundingClientRect();
    set(ref(database, `amei/${cadernoAtualId}`), { ts: Date.now(), x: e.clientX - rect.left, y: e.clientY - rect.top });
}, true); // O 'true' garante que este clique seja ouvido antes de qualquer outra coisa na tela!

function soltarCoracoes(x, y) {
    if (!folhaA4Wrapper) return;
    const coracao = document.createElement('div'); const emojisAmei = ['❤️', '💖', '✨', '🥰'];
    coracao.innerText = emojisAmei[Math.floor(Math.random() * emojisAmei.length)];
    coracao.className = 'animacao-amei'; coracao.style.left = `${x - 20}px`; coracao.style.top = `${y - 20}px`;
    folhaA4Wrapper.appendChild(coracao); setTimeout(() => coracao.remove(), 2000);
}

// ==========================================
// 10. PAGINAÇÃO E SINCRONIZAÇÃO EM TEMPO REAL
// ==========================================
function atualizarBotoesPaginacao() {
    document.getElementById('indicadorPagina').innerText = `Página ${paginaAtual} de ${totalPaginas}`;
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

document.getElementById('btnPaginaProxima')?.addEventListener('click', () => { if (paginaAtual < totalPaginas) { paginaAtual++; carregarPaginaAtual(); } });
document.getElementById('btnPaginaAnterior')?.addEventListener('click', () => { if (paginaAtual > 1) { paginaAtual--; carregarPaginaAtual(); } });

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

function carregarPaginaAtual() {
    atualizarBotoesPaginacao();
    if (escutaAnotacoes) escutaAnotacoes(); if (escutaStickers) escutaStickers(); if (escutaDesenhos) escutaDesenhos();
    if (ctxDesenho) ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height);

    escutaAnotacoes = onValue(ref(database, `anotacoes/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        const d = snapshot.val() || {};
        const camadaCapsula = document.getElementById('camadaCapsula');
        if (d.bloqueadoAte && d.bloqueadoAte > Date.now()) {
            caixaDeTexto.innerHTML = ''; caixaDeTexto.contentEditable = false;
            if (camadaCapsula) {
                camadaCapsula.classList.remove('escondido');
                document.getElementById('dataAberturaCapsula').innerText = new Date(d.bloqueadoAte).toLocaleDateString('pt-BR');
            }
        } else {
            if (camadaCapsula) camadaCapsula.classList.add('escondido');
            if (minhaPermissaoAtual !== 'leitor') caixaDeTexto.contentEditable = true;
            if (d.texto && document.activeElement !== caixaDeTexto && caixaDeTexto.innerHTML !== d.texto) caixaDeTexto.innerHTML = d.texto;
            else if (!d.texto && document.activeElement !== caixaDeTexto) caixaDeTexto.innerHTML = '';
        }
    });

    escutaStickers = onValue(ref(database, `stickers/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        if (areaStickers) areaStickers.innerHTML = '';
        snapshot.forEach(filho => {
            const id = filho.key; const d = filho.val();
            const div = document.createElement('div');
            div.className = 'sticker'; div.innerText = d.emoji; div.style.left = `${d.x}px`; div.style.top = `${d.y}px`;
            div.setAttribute('data-id', id); div.setAttribute('data-rot', d.rot || 0); div.style.transform = `rotate(${d.rot || 0}deg)`;
            if (areaStickers) areaStickers.appendChild(div);
        });
    });

    escutaDesenhos = onValue(ref(database, `desenhos/${cadernoAtualId}/pagina_${paginaAtual}`), (snapshot) => {
        if (desenhando) return;
        const d = snapshot.val();
        redimensionarCanvas();
        if (d && d.img && ctxDesenho) {
            const img = new Image();
            img.onload = () => { ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height); ctxDesenho.drawImage(img, 0, 0); };
            img.src = d.img;
        } else if (ctxDesenho) { ctxDesenho.clearRect(0, 0, canvasDesenho.width, canvasDesenho.height); }
    });
}

// ==========================================
// 11. MÚSICA, PRESENÇA E ROTINAS
// ==========================================
function embedMusica(link) {
    const divContainer = document.getElementById('containerMusica'); const divWidget = document.getElementById('widgetMusica');
    if (!divContainer || !divWidget) return;
    if (!link) { divContainer.classList.add('escondido'); divWidget.innerHTML = ''; return; }

    try {
        if (link.includes('spotify.com')) {
            const urlObj = new URL(link);
            const pathSegments = urlObj.pathname.split('/').filter(p => p);
            if (pathSegments.length >= 2) {
                const tipo = pathSegments[0]; const id = pathSegments[1];
                divWidget.innerHTML = `<iframe src="https://open.spotify.com/embed/${tipo}/${id}?utm_source=generator&theme=0" width="100%" height="152" frameBorder="0" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture" loading="lazy"></iframe>`;
                divContainer.classList.remove('escondido');
            }
        } else if (link.includes('youtube.com') || link.includes('youtu.be')) {
            let idVideo = link.includes('youtu.be') ? link.split('youtu.be/')[1].split('?')[0] : new URL(link).searchParams.get('v');
            divWidget.innerHTML = `<iframe width="100%" height="200" src="https://www.youtube.com/embed/${idVideo}" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
            divContainer.classList.remove('escondido');
        } else { divContainer.classList.add('escondido'); divWidget.innerHTML = ''; }
    } catch (e) { divContainer.classList.add('escondido'); divWidget.innerHTML = ''; }
}

function iniciarRotinasDoCaderno() {
    if (!cadernoAtualId) return;

    if (escutaTarefas) escutaTarefas(); if (escutaTotalPaginas) escutaTotalPaginas();
    if (escutaPresenca) escutaPresenca(); if (escutaAmei) escutaAmei();

    refMinhaPresenca = ref(database, `presenca/${cadernoAtualId}/${usuarioAtual.uid}`);
    set(refMinhaPresenca, { nome: nomeExibicaoAtual, foto: document.getElementById('avatarDashboard').src, online: true });
    onDisconnect(refMinhaPresenca).remove();

    escutaPresenca = onValue(ref(database, `presenca/${cadernoAtualId}`), (snap) => {
        const areaOnline = document.getElementById('areaUsuariosOnline'); areaOnline.innerHTML = '';
        if (snap.exists()) {
            snap.forEach(filho => {
                const dados = filho.val();
                let humorBadge = dados.humor ? `<div class="humor-badge">${dados.humor}</div>` : '';
                areaOnline.innerHTML += `<div class="avatar-presenca" title="${dados.nome}"><img src="${dados.foto}"><div class="dot-verde"></div>${humorBadge}</div>`;
            });
        }
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
        }
    });

    escutaTarefas = onValue(ref(database, `tarefas/${cadernoAtualId}`), (snapshot) => {
        const listaTarefasUi = document.getElementById('listaTarefas'); listaTarefasUi.innerHTML = '';
        snapshot.forEach((filho) => {
            const id = filho.key; const d = filho.val(); const li = document.createElement('li');
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
    });

    document.querySelectorAll('.btn-humor').forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!cadernoAtualId) return;
            const emoji = e.target.getAttribute('data-humor');
            update(ref(database, `presenca/${cadernoAtualId}/${usuarioAtual.uid}`), { humor: emoji });
            document.querySelectorAll('.btn-humor').forEach(b => b.classList.remove('ativo')); e.target.classList.add('ativo');
        });
    });
}

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
        salaEscura.style.position = 'absolute'; salaEscura.style.left = '0'; salaEscura.style.top = '0'; salaEscura.style.width = '800px'; salaEscura.style.zIndex = '-1000';
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