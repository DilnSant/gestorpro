import fs from 'node:fs';
import path from 'node:path';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import {
  PNG_VALIDO,
  baixar,
  criarOficina,
  derrubarServidor,
  enviarArquivo,
  prepararBanco,
  req,
  subirServidor,
} from './apoio';

// O achado crítico da auditoria: /uploads era servido por express.static antes de
// qualquer autenticação. Um GET sem token devolvia o arquivo de qualquer oficina.

let alfa: Awaited<ReturnType<typeof criarOficina>>;
let beta: Awaited<ReturnType<typeof criarOficina>>;

beforeAll(async () => {
  await prepararBanco();
  await subirServidor();
  alfa = await criarOficina('Oficina Alfa', 'alfa@arquivos.com');
  beta = await criarOficina('Oficina Beta', 'beta@arquivos.com');
});

afterAll(derrubarServidor);

const enviarPng = (token: string, nome = 'foto.png') =>
  enviarArquivo(token, nome, PNG_VALIDO, 'image/png');

describe('o buraco fechado', () => {
  it('não serve mais nada em /uploads', async () => {
    const enviado = await enviarPng(alfa.token);
    const chave = enviado.body.files[0].id;

    // Mesmo com um caminho plausível, o mount estático não existe mais.
    const direto = await baixar(`/uploads/${chave}`);
    expect(direto.status).toBe(404);
  });

  it('recusa leitura sem credencial nenhuma', async () => {
    const enviado = await enviarPng(alfa.token);
    const semNada = await baixar(enviado.body.files[0].url);
    expect(semNada.status).toBe(401);
  });
});

describe('escopo por oficina', () => {
  it('deixa o dono baixar com o próprio token', async () => {
    const enviado = await enviarPng(alfa.token);
    const baixado = await baixar(enviado.body.files[0].url, alfa.token);

    expect(baixado.status).toBe(200);
    expect(baixado.buffer.equals(PNG_VALIDO)).toBe(true);
  });

  it('responde 404 para token de outra oficina', async () => {
    const enviado = await enviarPng(alfa.token);
    const invasor = await baixar(enviado.body.files[0].url, beta.token);
    expect(invasor.status).toBe(404);
  });

  it('não deixa uma oficina apagar arquivo da outra', async () => {
    const enviado = await enviarPng(alfa.token);
    const id = enviado.body.files[0].id;

    const tentativa = await req('DELETE', `/api/files/${id}`, undefined, beta.token);
    expect(tentativa.status).toBe(404);

    // E o dono continua lendo.
    expect((await baixar(`/api/files/${id}`, alfa.token)).status).toBe(200);
  });
});

describe('URL assinada', () => {
  it('funciona sem header — é o que faz <img> e <a> renderizarem', async () => {
    const enviado = await enviarPng(alfa.token);
    const semHeader = await baixar(enviado.body.files[0].view_url);

    expect(semHeader.status).toBe(200);
    expect(semHeader.buffer.equals(PNG_VALIDO)).toBe(true);
  });

  it('não serve para outro arquivo', async () => {
    const um = await enviarPng(alfa.token);
    const outro = await enviarPng(alfa.token);

    const assinatura = String(um.body.files[0].view_url).split('?t=')[1];
    const cruzado = await baixar(`/api/files/${outro.body.files[0].id}?t=${assinatura}`);
    expect(cruzado.status).toBe(403);
  });

  it('recusa assinatura adulterada', async () => {
    const enviado = await enviarPng(alfa.token);
    const adulterada = String(enviado.body.files[0].view_url).replace(/.$/, 'x');
    expect((await baixar(adulterada)).status).toBe(403);
  });

  it('é idêntica entre duas serializações próximas, para o browser cachear', async () => {
    const enviado = await enviarPng(alfa.token);
    await req('POST', '/api/notes', { title: 'Com anexo', file_urls: [enviado.body.files[0].url] }, alfa.token);

    const primeira = await req('GET', '/api/notes', undefined, alfa.token);
    const segunda = await req('GET', '/api/notes', undefined, alfa.token);

    // Sem isso o src do <img> mudaria a cada resposta e a imagem seria rebaixada.
    expect(primeira.body[0].files[0].view_url).toBe(segunda.body[0].files[0].view_url);
  });
});

describe('confusão de audiência entre tokens', () => {
  it('não aceita token de sessão como assinatura de arquivo', async () => {
    const enviado = await enviarPng(alfa.token);
    const comSessao = await baixar(`/api/files/${enviado.body.files[0].id}?t=${alfa.token}`);
    expect(comSessao.status).toBe(403);
  });

  it('não aceita token de arquivo como token de sessão', async () => {
    const enviado = await enviarPng(alfa.token);
    const assinatura = String(enviado.body.files[0].view_url).split('?t=')[1]!;

    const comoSessao = await req('GET', '/api/clients', undefined, assinatura);
    expect(comoSessao.status).toBe(401);
  });
});

describe('tipo de arquivo', () => {
  it('recusa SVG — é XML executável servido na origem da API', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"></svg>';
    const r = await enviarArquivo(alfa.token, 'malicioso.svg', svg, 'image/svg+xml');
    expect(r.status).toBe(400);
  });

  it('recusa HTML disfarçado de PNG pela extensão', async () => {
    const html = '<html><script>alert(document.domain)</script></html>';
    const r = await enviarArquivo(alfa.token, 'inocente.png', html, 'image/png');

    // A extensão passaria; o conteúdo não.
    expect(r.status).toBe(400);
    expect(String(r.body.error)).toMatch(/conteúdo/i);
  });

  it('recusa arquivo cuja extensão não bate com o conteúdo', async () => {
    const r = await enviarArquivo(alfa.token, 'planilha.xlsx', PNG_VALIDO, 'image/png');
    expect(r.status).toBe(400);
  });

  it('aceita texto simples e o serve como anexo, nunca renderizado', async () => {
    const enviado = await enviarArquivo(alfa.token, 'notas.txt', 'apenas texto', 'text/plain');
    expect(enviado.status).toBe(201);

    const baixado = await baixar(enviado.body.files[0].view_url);
    expect(baixado.headers.get('content-disposition')).toMatch(/^attachment/);
  });
});

describe('cabeçalhos de contenção', () => {
  it('marca nosniff, CSP sandbox e cache privado', async () => {
    const enviado = await enviarPng(alfa.token);
    const baixado = await baixar(enviado.body.files[0].view_url);

    expect(baixado.headers.get('x-content-type-options')).toBe('nosniff');
    expect(baixado.headers.get('content-security-policy')).toContain('sandbox');
    expect(baixado.headers.get('cache-control')).toContain('private');
    expect(baixado.headers.get('referrer-policy')).toBe('no-referrer');
  });

  it('exibe imagem inline e nunca devolve tipo executável', async () => {
    const enviado = await enviarPng(alfa.token);
    const baixado = await baixar(enviado.body.files[0].view_url);

    expect(baixado.headers.get('content-disposition')).toBe('inline');
    expect(baixado.headers.get('content-type')).toBe('image/png');
    expect(baixado.headers.get('content-type')).not.toMatch(/html|svg/);
  });
});

describe('caminho no disco', () => {
  it('grava dentro da pasta da própria oficina, sem extensão', async () => {
    const { prisma } = await import('../src/prisma');
    const enviado = await enviarPng(alfa.token);

    const registro = await prisma.upload.findUnique({
      where: { id: enviado.body.files[0].id },
    });

    expect(registro?.storage_key.startsWith(`${alfa.companyId}${path.sep}`)).toBe(true);
    expect(path.extname(registro!.storage_key)).toBe('');
  });

  it('ignora nome de arquivo com travessia de diretório', async () => {
    const enviado = await enviarArquivo(
      alfa.token,
      '../../../../tmp/invadido.png',
      PNG_VALIDO,
      'image/png',
    );

    expect(enviado.status).toBe(201);
    expect(fs.existsSync('/tmp/invadido.png')).toBe(false);
  });
});

describe('exclusão', () => {
  it('apaga do banco e do disco', async () => {
    const { prisma } = await import('../src/prisma');
    const enviado = await enviarPng(alfa.token);
    const id = enviado.body.files[0].id;

    const registro = await prisma.upload.findUnique({ where: { id } });
    const caminho = path.resolve(__dirname, '../uploads', registro!.storage_key);
    expect(fs.existsSync(caminho)).toBe(true);

    expect((await req('DELETE', `/api/files/${id}`, undefined, alfa.token)).status).toBe(204);
    expect(fs.existsSync(caminho)).toBe(false);
    expect((await baixar(`/api/files/${id}`, alfa.token)).status).toBe(404);
  });

  it('apaga os anexos junto com a nota (item 34 do backlog)', async () => {
    const { prisma } = await import('../src/prisma');
    const enviado = await enviarPng(alfa.token);
    const anexo = enviado.body.files[0];

    const nota = await req('POST', '/api/notes', { title: 'Laudo', file_urls: [anexo.url] }, alfa.token);
    expect(nota.body.files).toHaveLength(1);

    await req('DELETE', `/api/notes/${nota.body.id}`, undefined, alfa.token);

    const registro = await prisma.upload.findUnique({ where: { id: anexo.id } });
    expect(registro?.deleted_at).not.toBeNull();
    expect((await baixar(`/api/files/${anexo.id}`, alfa.token)).status).toBe(404);
  });

  it('apaga o anexo retirado da nota na edição', async () => {
    const um = await enviarPng(alfa.token);
    const dois = await enviarPng(alfa.token);

    const nota = await req(
      'POST',
      '/api/notes',
      { title: 'Dois anexos', file_urls: [um.body.files[0].url, dois.body.files[0].url] },
      alfa.token,
    );

    await req('PUT', `/api/notes/${nota.body.id}`, { file_urls: [dois.body.files[0].url] }, alfa.token);

    expect((await baixar(`/api/files/${um.body.files[0].id}`, alfa.token)).status).toBe(404);
    expect((await baixar(`/api/files/${dois.body.files[0].id}`, alfa.token)).status).toBe(200);
  });
});

describe('referência entre oficinas', () => {
  it('recusa nota que aponta para arquivo de outra oficina', async () => {
    const daAlfa = await enviarPng(alfa.token);

    const tentativa = await req(
      'POST',
      '/api/notes',
      { title: 'Roubando anexo', file_urls: [daAlfa.body.files[0].url] },
      beta.token,
    );
    expect(tentativa.status).toBe(400);
  });

  it('recusa logo que aponta para arquivo de outra oficina', async () => {
    const daAlfa = await enviarPng(alfa.token);
    const tentativa = await req('PUT', '/api/company', { logo_url: daAlfa.body.files[0].url }, beta.token);
    expect(tentativa.status).toBe(400);
  });

  it('devolve a logo já assinada para o <img> conseguir usar', async () => {
    const enviado = await enviarPng(alfa.token);
    await req('PUT', '/api/company', { logo_url: enviado.body.files[0].url }, alfa.token);

    const empresa = await req('GET', '/api/company', undefined, alfa.token);
    expect(empresa.body.logo_url).toBe(enviado.body.files[0].url);
    expect(empresa.body.logo_view_url).toContain('?t=');

    expect((await baixar(empresa.body.logo_view_url)).status).toBe(200);
  });
});

describe('vínculo da nota', () => {
  it('recusa related_id de outra oficina', async () => {
    const cliente = await req('POST', '/api/clients', { name: 'Cliente Alfa' }, alfa.token);

    const tentativa = await req(
      'POST',
      '/api/notes',
      { title: 'Espiando', type: 'client', related_id: cliente.body.id },
      beta.token,
    );
    expect(tentativa.status).toBe(400);
  });
});
