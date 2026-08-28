// Ponto de entrada serverless da Vercel.
//
// O `backend/src/index.ts` continua existindo para desenvolvimento local, onde um
// processo de verdade fica de pé com `app.listen`. Aqui não há porta: a Vercel
// invoca esta função por requisição, e o Express é usado como handler.
//
// Todas as rotas chegam por este arquivo — o `vercel.json` reescreve `/api/*`
// para cá, e o Express faz o roteamento interno como sempre fez.

import { criarApp } from '../backend/src/app';

export default criarApp();
