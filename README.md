# 📓 Memory Box

Um aplicativo web interativo, construído com Vanilla JavaScript e Firebase, focado em criar um espaço íntimo e seguro para amigos ou casais guardarem memórias, organizarem planos e interagirem em tempo real. 

O projeto funciona como uma mescla de editor de texto rico, lousa de desenhos (canvas) e scrapbook interativo (com polaroids e stickers).

## ✨ Principais Funcionalidades

* **🔐 Autenticação Segura:** Login, cadastro e recuperação de senha via e-mail utilizando Firebase Auth.
* **👥 Sistema de Permissões:** Hierarquia completa (Dono, Administrador, Editor e Leitor) com envio de convites e gestão de acessos.
* **📖 Paginação Dinâmica:** O caderno é dividido em folhas A4 infinitas. O dono pode adicionar ou excluir páginas sem quebrar a sequência do conteúdo.
* **📸 Polaroids e Scrapbook:**
  * Upload de imagens que são automaticamente estilizadas como *Polaroids* com espaço para legendas em fonte cursiva.
  * Inserção de *Stickers* (emojis) que podem ser arrastados, rotacionados e posicionados livremente por cima do texto.
* **🖌️ Lousa Mágica (Canvas):** Ferramenta de desenho à mão livre sobre a página, com suporte a borracha e sincronização de imagem em base64.
* **⏳ Cápsula do Tempo:** Bloqueio de páginas específicas até uma data futura pré-determinada.
* **❤️ Interações em Tempo Real:** * "Check-in" de humor visualizado por quem está na sala.
  * Duplo-clique na folha para disparar uma animação de corações flutuantes sincronizada para todos os usuários online.
  * Indicador de presença (bolinha verde) e avatar de quem está lendo o caderno naquele momento.
* **🎵 Trilha Sonora Integrada:** Player do YouTube ou Spotify embutido na lateral do caderno, configurável por link.
* **✅ Planos e Metas:** Lista de tarefas (To-Do list) global para o caderno, atualizada instantaneamente.
* **📄 Exportação Perfeita para PDF:** Motor de renderização utilizando `html2pdf.js` que gera o documento através de uma "Sala Escura" no DOM, garantindo que backgrounds, desenhos e stickers saiam perfeitamente alinhados na exportação.
* **🌙 Modo Escuro:** Alternância de tema preservada no `localStorage`.

## 🛠️ Tecnologias Utilizadas

* **Frontend:** HTML5, CSS3, Vanilla JavaScript (ES6 Modules)
* **Backend / BaaS:** Firebase Realtime Database
* **Autenticação:** Firebase Authentication
* **Bibliotecas Externas:** `html2pdf.js` (Exportação de PDF)

## 🚀 Como Rodar o Projeto

1. Clone este repositório.
2. Crie um projeto no [Firebase](https://firebase.google.com/) e ative o **Authentication** (Email/Senha) e o **Realtime Database**.
3. No arquivo `main.js`, substitua o objeto `firebaseConfig` pelas credenciais do seu projeto Firebase.
5. Abra o arquivo index.html em um navegador (recomenda-se o uso de um Live Server genérico para evitar problemas de CORS com os módulos do Firebase).


Criado com ❤, Raul Pedrogan.
