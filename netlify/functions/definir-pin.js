// Recebe { cadernoId, pin, idToken }. Confere quem está pedindo (idToken do
// Firebase Auth) e se essa pessoa tem permissão sobre o caderno, ANTES de
// gravar o hash em seguranca_pins/{cadernoId} — nó isolado, fora da árvore de
// "cadernos", bloqueado pra leitura/escrita direta do client nas Regras do Firebase.
const { getAuth, getDatabase } = require('./_firebaseAdmin');
const crypto = require('crypto');

function gerarSalt() {
    return crypto.randomBytes(16).toString('hex');
}

function hashPin(pin, salt) {
    return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ erro: 'Método não permitido' }) };
    }

    let cadernoId, pin, idToken;
    try {
        ({ cadernoId, pin, idToken } = JSON.parse(event.body || '{}'));
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ erro: 'JSON inválido' }) };
    }

    if (!cadernoId || typeof pin !== 'string' || !idToken) {
        return { statusCode: 400, body: JSON.stringify({ erro: 'Parâmetros ausentes' }) };
    }

    try {
        // 1. Confirma que o token é válido e pega o uid de quem está pedindo.
        const decoded = await getAuth().verifyIdToken(idToken);
        const uid = decoded.uid;

        // 2. Confirma que esse uid tem permissão sobre o caderno.
        // AJUSTE AQUI se você criar outros papéis além de dono/admin/editor/leitor.
        const db = getDatabase();
        const permSnap = await db.ref(`cadernos/${cadernoId}/usuarios_permitidos/${uid}`).once('value');
        const permissao = permSnap.val();
        if (permissao !== 'dono' && permissao !== 'admin' && permissao !== 'editor') {
            return { statusCode: 403, body: JSON.stringify({ erro: 'Sem permissão para alterar este caderno' }) };
        }

        const refSeguranca = db.ref(`seguranca_pins/${cadernoId}`);
        const refConfig = db.ref(`cadernos/${cadernoId}/config`);

        if (pin === '') {
            // Campo vazio explícito = remover a senha do caderno.
            // (No main.js atual, campo vazio no salvar-config significa "manter
            // a senha atual" — esse endpoint só é chamado quando pin !== ''. Deixei
            // esse caminho pronto caso você adicione um botão de "remover senha".)
            await refSeguranca.remove();
            await refConfig.update({ temSenha: false });
            return { statusCode: 200, body: JSON.stringify({ ok: true }) };
        }

        const salt = gerarSalt();
        const hash = hashPin(pin, salt);
        await refSeguranca.set({ pin: hash, pinSalt: salt, tentativasFalhas: 0, bloqueadoAte: null });
        await refConfig.update({ temSenha: true });

        return { statusCode: 200, body: JSON.stringify({ ok: true }) };
    } catch (erro) {
        console.error('Erro ao definir PIN:', erro);
        return { statusCode: 500, body: JSON.stringify({ erro: 'Erro interno' }) };
    }
};