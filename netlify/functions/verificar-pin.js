// Recebe { cadernoId, pin }, confere contra o hash salvo em
// seguranca_pins/{cadernoId} (nó ISOLADO, fora da árvore de "cadernos" — se
// estivesse dentro de cadernos/{id}, o .read:true que a lista de cadernos
// precisa lá em cima vazaria pra esse nó também, já que no Firebase RTDB uma
// regra .read:false num filho NUNCA revoga o acesso liberado por um pai).
// O client NUNCA lê esse nó — só esta function, via Admin SDK.
const { getDatabase } = require('./_firebaseAdmin');
const crypto = require('crypto');

const MAX_TENTATIVAS = 5;
const BLOQUEIO_MS = 5 * 60 * 1000; // 5 minutos

function hashPin(pin, salt) {
    return crypto.createHash('sha256').update(pin + salt).digest('hex');
}

exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ erro: 'Método não permitido' }) };
    }

    let cadernoId, pin;
    try {
        ({ cadernoId, pin } = JSON.parse(event.body || '{}'));
    } catch (e) {
        return { statusCode: 400, body: JSON.stringify({ erro: 'JSON inválido' }) };
    }

    if (!cadernoId || typeof pin !== 'string') {
        return { statusCode: 400, body: JSON.stringify({ erro: 'Parâmetros ausentes' }) };
    }

    const db = getDatabase();
    const refSeguranca = db.ref(`seguranca_pins/${cadernoId}`);

    try {
        const snap = await refSeguranca.once('value');
        const seguranca = snap.val() || {};

        // Já está bloqueado por tentativas demais? Nem perde tempo comparando.
        if (seguranca.bloqueadoAte && seguranca.bloqueadoAte > Date.now()) {
            const restanteMs = seguranca.bloqueadoAte - Date.now();
            return {
                statusCode: 200,
                body: JSON.stringify({
                    valido: false,
                    bloqueado: true,
                    tenteNovamenteEmSegundos: Math.ceil(restanteMs / 1000)
                })
            };
        }

        if (!seguranca.pin) {
            // Caderno sem PIN configurado (não deveria nem cair aqui se o
            // client checar config.temSenha antes, mas não custa proteger).
            return { statusCode: 200, body: JSON.stringify({ valido: true }) };
        }

        const hashCalculado = hashPin(pin, seguranca.pinSalt || '_salt_memories');

        if (hashCalculado === seguranca.pin) {
            if (seguranca.tentativasFalhas || seguranca.bloqueadoAte) {
                await refSeguranca.update({ tentativasFalhas: 0, bloqueadoAte: null });
            }
            return { statusCode: 200, body: JSON.stringify({ valido: true }) };
        }

        // Errou: incrementa o contador e bloqueia temporariamente se estourou o limite.
        const tentativas = (seguranca.tentativasFalhas || 0) + 1;
        const atualizacao = { tentativasFalhas: tentativas };
        if (tentativas >= MAX_TENTATIVAS) {
            atualizacao.bloqueadoAte = Date.now() + BLOQUEIO_MS;
        }
        await refSeguranca.update(atualizacao);

        return {
            statusCode: 200,
            body: JSON.stringify({
                valido: false,
                bloqueado: tentativas >= MAX_TENTATIVAS,
                tentativasRestantes: Math.max(0, MAX_TENTATIVAS - tentativas)
            })
        };
    } catch (erro) {
        console.error('Erro ao verificar PIN:', erro);
        return { statusCode: 500, body: JSON.stringify({ erro: 'Erro interno' }) };
    }
};