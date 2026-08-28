import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { prisma } from '../prisma';
import {
  MINUTOS_BLOQUEIO,
  TENTATIVAS_ATE_BLOQUEIO,
  assinarToken,
  conferirSenha,
  gerarHash,
  validarSenha,
} from '../lib/auth';
import { PAPEL_PADRAO, type Papel } from '../lib/roles';
import { exigirAutenticacao, usuarioDaRequisicao } from '../middleware/authMiddleware';

const router = Router();

// Nunca selecione o usuário sem esta lista: o Prisma devolve todos os escalares
// por padrão, e `password` iria junto para o navegador.
const CAMPOS_PUBLICOS = {
  id: true,
  email: true,
  name: true,
  role: true,
  company_id: true,
  createdAt: true,
} as const;

// Sem limite de tentativas, a política de senha não vale nada: dá para testar
// milhares por minuto.
//
// A suíte de testes cria dezenas de contas do mesmo endereço, então o limite por
// IP é desligado ali. O bloqueio por tentativas erradas (que é por conta, não por
// IP) continua valendo e continua sendo testado.
//
// Variável dedicada em vez de NODE_ENV: ferramenta de deploy mexe em NODE_ENV por
// conta própria, e o efeito de errar aqui é silencioso — nada quebra, só some a
// proteção.
const limitePorIpDesligado = process.env.RATE_LIMIT_DISABLED === '1';

const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => limitePorIpDesligado,
  message: { error: 'Muitas tentativas. Aguarde alguns minutos e tente de novo.' },
});

const limiteCadastro = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => limitePorIpDesligado,
  message: { error: 'Muitas contas criadas a partir daqui. Tente novamente mais tarde.' },
});

// Hash bem formado que nunca confere. Existe para o caminho "usuário não existe"
// gastar o mesmo tempo de argon2 do caminho real.
const HASH_DE_COMPARACAO =
  '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

const normalizarEmail = (valor: unknown) =>
  typeof valor === 'string' ? valor.trim().toLowerCase() : '';

const pareceEmail = (valor: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valor);

const responderComToken = (
  res: Parameters<typeof router.post>[1] extends never ? never : any,
  usuario: { id: string; role: string; company_id: string | null },
  corpo: unknown,
) => {
  const token = assinarToken({
    sub: usuario.id,
    role: usuario.role as Papel,
    company_id: usuario.company_id,
  });
  res.json({ token, user: corpo });
};

router.post('/register', limiteCadastro, async (req, res) => {
  const email = normalizarEmail(req.body?.email);
  const nome = typeof req.body?.name === 'string' ? req.body.name.trim() : '';
  const senha = req.body?.password;

  if (!pareceEmail(email)) {
    return res.status(400).json({ error: 'Informe um e-mail válido.' });
  }
  if (!nome) {
    return res.status(400).json({ error: 'Informe seu nome.' });
  }
  const problemaSenha = validarSenha(senha);
  if (problemaSenha) {
    return res.status(400).json({ error: problemaSenha });
  }

  // Responder 409 para e-mail existente e 200 para novo transforma o cadastro num
  // oráculo: qualquer um descobre quem tem conta no sistema. A resposta é a mesma
  // nos dois casos, e o tempo é equalizado pelo hash abaixo.
  const jaExiste = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (jaExiste) {
    await gerarHash(senha as string);
    return res.status(202).json({
      pendente: true,
      message:
        'Se este e-mail ainda não tiver conta, ela será criada. Verifique sua caixa de entrada.',
    });
  }

  // `role` não é lido do corpo: ninguém se promove a admin no cadastro.
  const usuario = await prisma.user.create({
    data: {
      email,
      name: nome,
      password: await gerarHash(senha as string),
      role: PAPEL_PADRAO,
      password_changed_at: new Date(),
      last_login_at: new Date(),
    },
    select: CAMPOS_PUBLICOS,
  });

  responderComToken(res, usuario, usuario);
});

router.post('/login', limiteLogin, async (req, res) => {
  const email = normalizarEmail(req.body?.email);
  const senha = req.body?.password;

  if (!email || typeof senha !== 'string' || senha === '') {
    return res.status(400).json({ error: 'Informe e-mail e senha.' });
  }

  const usuario = await prisma.user.findUnique({ where: { email } });

  // Mesma resposta para e-mail inexistente e senha errada: distinguir os dois
  // permite descobrir quem tem conta no sistema.
  const recusar = () => res.status(401).json({ error: 'E-mail ou senha incorretos.' });

  if (!usuario) {
    // Gasta um tempo comparável ao de uma verificação real, para que a diferença
    // de resposta não revele se o e-mail existe.
    await conferirSenha(HASH_DE_COMPARACAO, senha);
    return recusar();
  }

  if (usuario.locked_until && usuario.locked_until > new Date()) {
    // Mesma resposta de credencial errada: dizer "bloqueada" confirma que a conta
    // existe, e o bloqueio responderia em milissegundos, sem passar pelo hash.
    await conferirSenha(HASH_DE_COMPARACAO, senha);
    return recusar();
  }

  // O bloqueio expirou: zerar o contador. Sem isto ele só zerava num login
  // bem-sucedido — que é justamente o que o bloqueio impede. O contador ficava em
  // 5 para sempre, e uma única senha errada a cada 15 min mantinha qualquer conta
  // fora do ar indefinidamente, sem o atacante precisar saber a senha.
  const contadorBase =
    usuario.locked_until && usuario.locked_until <= new Date() ? 0 : usuario.failed_login_count;

  if (!(await conferirSenha(usuario.password, senha))) {
    const tentativas = contadorBase + 1;
    await prisma.user.update({
      where: { id: usuario.id },
      data: {
        failed_login_count: tentativas,
        locked_until:
          tentativas >= TENTATIVAS_ATE_BLOQUEIO
            ? new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000)
            : null,
      },
    });
    return recusar();
  }

  const atualizado = await prisma.user.update({
    where: { id: usuario.id },
    data: { failed_login_count: 0, locked_until: null, last_login_at: new Date() },
    select: CAMPOS_PUBLICOS,
  });

  responderComToken(res, atualizado, atualizado);
});

/** Quem sou eu — usado pelo frontend para restaurar a sessão ao abrir o app. */
router.get('/me', exigirAutenticacao, async (req, res) => {
  const usuario = await prisma.user.findUnique({
    where: { id: usuarioDaRequisicao(req).id },
    select: { ...CAMPOS_PUBLICOS, company: true },
  });
  if (!usuario) return res.status(401).json({ error: 'Sessão inválida.' });
  res.json(usuario);
});

/** Cadastro inicial da oficina, logo após o primeiro acesso. */
router.post('/setup-company', exigirAutenticacao, async (req, res) => {
  const { name, phone, email, cnpj, address } = req.body ?? {};

  if (typeof name !== 'string' || name.trim() === '') {
    return res.status(400).json({ error: 'O nome da empresa é obrigatório.' });
  }

  const atual = await prisma.user.findUnique({
    where: { id: usuarioDaRequisicao(req).id },
    select: { company_id: true, role: true },
  });
  if (!atual) return res.status(401).json({ error: 'Sessão inválida.' });

  // Sem isto, um usuário poderia criar empresas repetidamente e abandonar as
  // anteriores, cada uma virando um registro órfão.
  if (atual.company_id) {
    return res.status(409).json({ error: 'Sua conta já está vinculada a uma oficina.' });
  }

  try {
    // Transação: se o vínculo falhar, a empresa criada some junto. Antes ficava
    // órfã no banco e ainda aparecia listada no painel administrativo.
    const usuario = await prisma.$transaction(async (tx) => {
      const empresa = await tx.company.create({
        data: {
          name: name.trim(),
          phone: phone ?? null,
          email: email ?? null,
          cnpj: cnpj ?? null,
          address: address ?? null,
        },
      });
      return tx.user.update({
        where: { id: usuarioDaRequisicao(req).id },
        data: { company_id: empresa.id },
        select: { ...CAMPOS_PUBLICOS, company: true },
      });
    });

    responderComToken(res, usuario, usuario);
  } catch (error) {
    res.status(400).json({ error: 'Não foi possível criar a empresa.' });
  }
});

/**
 * Impersonação: o admin da plataforma passa a enxergar os dados de uma oficina.
 * `company_id: null` desfaz e devolve o admin ao painel.
 *
 * O token é reemitido porque é dele que o `company_id` sai — mudar só o registro
 * no banco não teria efeito nenhum sobre as requisições seguintes.
 */
router.post('/impersonate', exigirAutenticacao, async (req, res) => {
  if (usuarioDaRequisicao(req).role !== 'admin') {
    return res.status(404).json({ error: 'Não encontrado.' });
  }

  const bruto = req.body?.company_id;
  let alvo: string | null;

  if (bruto === null) {
    alvo = null;
  } else if (typeof bruto === 'string' && bruto.trim() !== '') {
    alvo = bruto.trim();
    const existe = await prisma.company.findUnique({ where: { id: alvo }, select: { id: true } });
    if (!existe) return res.status(404).json({ error: 'Empresa não encontrada.' });
  } else {
    return res.status(400).json({ error: 'Empresa inválida.' });
  }

  const usuario = await prisma.user.update({
    where: { id: usuarioDaRequisicao(req).id },
    data: { company_id: alvo },
    select: { ...CAMPOS_PUBLICOS, company: true },
  });

  responderComToken(res, usuario, usuario);
});

router.post('/change-password', limiteLogin, exigirAutenticacao, async (req, res) => {
  const atual = req.body?.current_password;
  const nova = req.body?.new_password;

  const problema = validarSenha(nova);
  if (problema) return res.status(400).json({ error: problema });

  const usuario = await prisma.user.findUnique({ where: { id: usuarioDaRequisicao(req).id } });
  if (!usuario) return res.status(401).json({ error: 'Sessão inválida.' });

  if (typeof atual !== 'string' || !(await conferirSenha(usuario.password, atual))) {
    // Contabiliza no mesmo contador do login: sem isso a senha atual podia ser
    // adivinhada sem limite e sem deixar rastro.
    const tentativas = usuario.failed_login_count + 1;
    await prisma.user.update({
      where: { id: usuario.id },
      data: {
        failed_login_count: tentativas,
        locked_until:
          tentativas >= TENTATIVAS_ATE_BLOQUEIO
            ? new Date(Date.now() + MINUTOS_BLOQUEIO * 60_000)
            : null,
      },
    });
    return res.status(401).json({ error: 'A senha atual está incorreta.' });
  }

  await prisma.user.update({
    where: { id: usuario.id },
    data: { password: await gerarHash(nova as string), password_changed_at: new Date() },
  });

  res.json({ ok: true });
});

export default router;
