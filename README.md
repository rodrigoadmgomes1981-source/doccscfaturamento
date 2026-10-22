# Faturamento de Serviços Médicos

Sistema de fechamento mensal de serviços médicos:

1. **Importação** do relatório *Financeiro* do Pega Plantão (.xlsx). A quantidade usada é a **apurada**, coluna *Duração (Tolerância)*.
2. **Conferência** por médico e por especialidade/tipo, com horas planejadas, realizadas e apuradas. Ajustes exigem justificativa e vão para o log.
3. **Aprovação**: trava o relatório e emite o resumo de faturamento e pagamento com a margem operacional.
4. **Pedido de NF (PENF)** no layout da aba *PENF* do fechamento.
5. **Folha de pagamento** no layout da *Planilha de Importação* (abas FOLHA MEDICA, Consolidada e Importação Sankhya).
6. **Observações do mês**, com histórico de quem salvou e quando.
7. **Dashboard gerencial**: faturamento e pagamento por especialidade e tipo/local, % pagamento/faturamento, horas, saldo remanescente do contrato e tempo de fechamento.

Inclui também o cadastro de **contratos** (valores a pagar e a faturar, unidade hora/plantão/consulta/procedimento, dados da NF e do ERP), o cadastro de **médicos** e a administração de **usuários e permissões**.

---

## Arquitetura

| Camada | Tecnologia |
|---|---|
| Front-end | Vite + JavaScript (sem framework), Chart.js, SheetJS (xlsx) |
| Banco, login e tempo real | **Supabase** (Postgres + Auth + Realtime) |
| Hospedagem | Vercel (ou Netlify / Docker + nginx) |

Os dados ficam na tabela `public.docs` (um JSON por registro, com `path` no formato `colecao/id`). As regras de acesso (RLS) garantem que:

- só usuários **liberados** em *Administração › Usuários*, ou cadastrados em `app_admins`, leem e gravam dados;
- só quem tem a permissão **Administrar** altera usuários e parâmetros.

As permissões finas (importar, conferir, aprovar, emitir NF, gerar folha…) controlam as telas e os botões.

```
├── index.html
├── src/
│   ├── main.js              # login (Supabase Auth) e inicialização
│   ├── app.js               # telas e fluxo do fechamento
│   ├── core.js              # regras de cálculo (testadas)
│   ├── styles.css
│   └── platform/
│       ├── client.js        # cria o cliente Supabase a partir do .env
│       └── supabase.js      # camada de dados (docs + tempo real + usuários)
├── supabase/
│   ├── migrations/20261022000000_schema.sql   # tabelas, RLS, funções, realtime
│   └── seed.sql                               # admins, parâmetros e contratos iniciais
├── tests/                   # npm test (regras + camada de dados) e ambiente e2e
├── vercel.json · netlify.toml · Dockerfile · nginx.conf
└── .github/workflows/ci.yml
```

---

## Instalação passo a passo

### 1. Supabase (banco e login)

1. Crie um projeto em <https://supabase.com> (região **South America (São Paulo)**).
2. Abra **SQL Editor** e rode, nesta ordem:
   1. o conteúdo de `supabase/migrations/20261022000000_schema.sql`;
   2. o conteúdo de `supabase/seed.sql`. **Antes**, troque ou adicione na primeira instrução os e-mails dos administradores gerais.
3. Em **Authentication › URL Configuration**:
   - **Site URL**: a URL de produção (ex.: `https://faturamento-medico.vercel.app`);
   - **Redirect URLs**: a mesma URL e `http://localhost:5173` para desenvolvimento.
4. Em **Authentication › Providers › Email**, mantenha *Email* habilitado. Recomendado: deixar *Confirm email* ligado.
5. Copie **Project URL** e **anon public key** em **Project Settings › API**.

> Com a CLI do Supabase, o arquivo de migração também pode ser aplicado com `supabase link` e depois `supabase db push`. O seed roda com `psql` ou pelo SQL Editor.

### 2. GitHub

```bash
git init
git add .
git commit -m "Sistema de faturamento de serviços médicos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/faturamento-medico.git
git push -u origin main
```

O workflow `.github/workflows/ci.yml` roda os testes e o build a cada push. Para o build do CI usar o seu Supabase, cadastre os *secrets* `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` em *Settings › Secrets and variables › Actions*. Sem eles o build passa do mesmo jeito.

### 3. Vercel

1. Em <https://vercel.com/new>, importe o repositório. O framework **Vite** é detectado sozinho.
2. Em **Environment Variables**, cadastre:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = anon public key
3. Clique em **Deploy**. A cada push na `main`, a Vercel publica de novo.

Também são aceitos os nomes criados pela integração *Supabase* do Marketplace da Vercel (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_ANON_KEY`).

**Se aparecer "Configuração pendente":** as variáveis não estavam disponíveis no build. Os valores do Supabase são gravados no site no momento do build. Para resolver:

1. Cadastre as variáveis marcando **Production**.
2. Vá em **Deployments › ⋯ › Redeploy**.
3. Confira no log do build as linhas `[faturamento] Supabase URL: ok` e `[faturamento] Supabase key: ok`.

A chave *service_role* é recusada de propósito: use sempre a *anon public*.

### 4. Primeiro acesso

1. Abra o site e use **Criar conta** com o e-mail cadastrado em `app_admins`. Confirme pelo e-mail recebido.
2. Entre. Você terá acesso total (Administrador geral).
3. Para liberar a equipe: cada pessoa cria a conta, e o administrador a encontra em **Administração › Usuários**, escolhe o perfil e ajusta as permissões.

---

## Outras hospedagens

**Netlify**: importe o repositório. O `netlify.toml` já define build e redirecionamento. Cadastre as mesmas variáveis `VITE_*`.

**Docker** (servidor próprio):

```bash
docker build \
  --build-arg VITE_SUPABASE_URL=https://SEU-PROJETO.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=sua-chave \
  -t faturamento-medico .
docker run -d -p 8080:80 faturamento-medico
```

---

## Desenvolvimento local

```bash
cp .env.example .env      # preencha com os dados do Supabase
npm install
npm run dev               # http://localhost:5173
npm test                  # regras de cálculo + camada de dados
npm run build             # gera dist/
```

**Testar sem Supabase**: com `npm run dev` rodando, abra `http://localhost:5173/tests/e2e/index.html`. O sistema roda com um banco em memória, sem login, e tudo se perde ao recarregar. É útil para experimentar a importação do Pega Plantão.

---

## Regras de cálculo (resumo)

| Item | Regra |
|---|---|
| Quantidade base | Itens por **hora** usam as horas apuradas (tolerância). Itens por **plantão** usam o nº de plantões com horas apuradas. **Consulta/procedimento** são informados na conferência. |
| Pagamento | Qtd a pagar × valor a pagar do item. Se houver valor diferenciado para o médico, ele prevalece. Com a fonte "Pega Plantão", usa o *Total (Tolerância)* do relatório. |
| Faturamento | Qtd a faturar × valor a faturar do item. |
| Margem operacional | Faturamento − pagamento. |
| Taxa de sócio | R$ 150 para vínculo SÓCIO acima de 24 h (configurável por contrato). |
| Nº documento (ERP) | Nº do contrato + MM + AA (ex.: 986870726). |
| Cód. reduzido | Sigla do CR + MM + AA (ex.: PAP0726). |
| Vencimento | Último dia do mês seguinte à competência (editável). |
| Naturezas | Honorários 120101 · PJ 120102 · RPA 120103 · Pró-Labore 120104 (editáveis). |
| Saldo remanescente | Valor global do contrato − faturamento aprovado acumulado. |
| Tempo de fechamento | Da importação até o último entre *Emitir pedido de NF* e *Gerar folha*. |

Os testes em `tests/core.test.js` reproduzem o fechamento PAP 07/2026:

- faturamento de R$ 323.461,04;
- pagamento de R$ 284.600,00;
- taxa de sócio de R$ 2.400 e líquido de R$ 282.200,00.

---

## Observações

- **SheetJS**: o projeto usa `xlsx@0.18.5`, a última versão publicada no npm. A SheetJS distribui versões mais novas pelo próprio CDN. Para atualizar, troque a dependência por `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` e rode `npm install`. O sistema só lê planilhas da própria equipe.
- **Backup**: o Supabase faz backup diário nos planos pagos. No plano gratuito, exporte a tabela `docs` periodicamente (*Table Editor › Export*).
- **Chave anon**: a `anon key` é pública por desenho. Quem protege os dados são as regras RLS do arquivo de migração. Nunca coloque a `service_role key` no front-end.
