# Faturamento de Serviços Médicos

Sistema de fechamento mensal de serviços médicos:

1. **Importação** do relatório *Financeiro* do Pega Plantão (.xlsx). A quantidade usada é a **apurada**, coluna *Duração (Tolerância)*.
2. **Conferência** por médico e por especialidade/tipo, com horas planejadas, realizadas e apuradas. Ajustes exigem justificativa e vão para o log.
3. **Aprovação**: trava o relatório e emite o resumo de faturamento e pagamento com a margem operacional.
4. **Pedido de NF (PENF)** no layout da aba *PENF* do fechamento.
5. **Folha de pagamento** no layout da *Planilha de Importação* (abas FOLHA MEDICA, Consolidada e Importação Sankhya).
6. **Observações do mês**, com histórico de quem salvou e quando.
7. **Dashboard gerencial**: faturamento e pagamento por especialidade e tipo/local, % pagamento/faturamento, horas, saldo remanescente e tempo de fechamento.

Inclui também cadastro de **contratos**, de **médicos** e **Administração** de usuários (contas, senhas e permissões).

**Não depende de serviços externos**: na Vercel, os dados ficam no **Vercel Blob** (armazenamento privado da própria Vercel) e o login é do próprio sistema.

---

## Arquitetura

| Parte | Como funciona |
|---|---|
| Telas | Vite + JavaScript, Chart.js, SheetJS (xlsx) |
| API | `api/auth.js` e `api/db.js` (Vercel Functions) → `server/api.js` |
| Dados | **Vercel Blob privado**, um arquivo JSON por registro. Fora da Vercel, uma pasta local (`.data/`). |
| Login | E-mail e senha, com senha criptografada (scrypt) e sessão em cookie assinado (HttpOnly, 7 dias) |
| Atualização entre usuários | A cada 8 s cada tela consulta um registro de mudanças e baixa só o que mudou |

Regras de acesso, verificadas no servidor:

- só lê e grava quem é **administrador geral** ou está **ativo** em Administração › Usuários;
- **usuários** e **parâmetros** só podem ser alterados por quem tem a permissão *Administrar*;
- gravações simultâneas no mesmo registro não se perdem (controle de versão por ETag).

As permissões finas (importar, conferir, aprovar, emitir NF, gerar folha…) controlam telas e botões.

```
├── api/                 # Vercel Functions (auth, db)
├── server/
│   ├── api.js           # login, permissões, dados, registro de mudanças
│   ├── storage.js       # Vercel Blob privado ou pasta local
│   ├── seed.js          # carga inicial (empresas pagadoras, naturezas, CRs, contratos PAP e MPF)
│   └── node-server.js   # servidor para desenvolvimento e hospedagem própria
├── src/                 # telas (app.js), regras de cálculo (core.js), login (main.js)
├── tests/               # npm test
├── vercel.json · Dockerfile · .github/workflows/ci.yml
```

---

## Publicar na Vercel

### 1. GitHub

```bash
git init
git add .
git commit -m "Sistema de faturamento de serviços médicos"
git branch -M main
git remote add origin https://github.com/SEU-USUARIO/faturamento-medico.git
git push -u origin main
```

### 2. Projeto na Vercel

1. Em <https://vercel.com/new>, importe o repositório. O framework **Vite** é detectado sozinho. Clique em **Deploy**.
2. Abra o projeto › **Storage** › **Create** › **Blob**. Escolha o acesso **Private** e conecte ao projeto, marcando todos os ambientes.
3. (Recomendado) Em **Settings › Environment Variables**, crie `ADMIN_EMAILS` com o seu e-mail. Assim só esse e-mail consegue criar a conta de administrador no primeiro acesso.
4. Em **Deployments**, clique em **⋯** no último deploy › **Redeploy**. Conexões e variáveis novas só valem a partir de um deploy novo.

### 3. Primeiro acesso

1. Abra o site. Aparece **Primeiro acesso**: crie a conta de administrador (nome, e-mail e senha).
2. O sistema grava a carga inicial: empresas pagadoras, naturezas, centros de resultado e os contratos PAP e MPF.
3. Em **Administração › Criar conta de acesso**, cadastre a equipe. O sistema gera uma **senha temporária** para você repassar, e a pessoa troca a senha no primeiro login.
4. Esqueceu a senha? O administrador clica em **Redefinir senha** no usuário.

### 4. (Opcional) Envio de e-mails aos médicos

Os botões ✉ (demonstrativo de horas e valores) e **NF** (solicitação de NF a médicos PJ) ficam no detalhamento do fechamento e na folha.

- **Sem configuração:** o botão abre o e-mail pronto no programa de e-mail de quem está usando, ou copia o texto.
- **Com configuração:** o sistema envia sozinho. Há dois jeitos:

#### Microsoft 365 pela API Microsoft Graph (recomendado)

Funciona mesmo com o *SMTP AUTH* desligado na empresa. A Microsoft está aposentando o envio por SMTP com usuário e senha.

1. Em <https://entra.microsoft.com>, abra **Identidade › Aplicativos › Registros de aplicativo › Novo registro**. Nome: *Faturamento Médico*. Tipo de conta: *somente este diretório*.
2. Na página do aplicativo, copie o **ID do aplicativo (cliente)** e o **ID do diretório (locatário)**.
3. Em **Certificados e segredos › Novo segredo do cliente**, copie o **Valor** e anote a data de validade.
4. Em **Permissões de API › Adicionar › Microsoft Graph › Permissões de aplicativo**, marque **Mail.Send** e clique em **Conceder consentimento do administrador**.
5. **Recomendado:** peça ao TI para restringir o aplicativo a enviar só pela caixa do faturamento (*RBAC for Applications* ou *Application Access Policy* no Exchange Online). Sem isso, a permissão Mail.Send vale para qualquer caixa da empresa.
6. Na Vercel (Settings › Environment Variables), cadastre as variáveis abaixo e faça um *Redeploy*:

| Variável | Valor |
|---|---|
| `MS_TENANT_ID` | ID do diretório (locatário) |
| `MS_CLIENT_ID` | ID do aplicativo (cliente) |
| `MS_CLIENT_SECRET` | valor do segredo do cliente |
| `MS_SENDER` | caixa que envia, ex.: `faturamento@empresa.com.br` |

O e-mail sai por essa caixa, fica salvo nos *Itens enviados* e tem "responder para" o e-mail de quem clicou em enviar. Quando o segredo vencer, gere outro e troque `MS_CLIENT_SECRET`.

#### SMTP (Gmail, outros provedores, ou Microsoft 365 com SMTP AUTH habilitado)

| Variável | Exemplo |
|---|---|
| `SMTP_HOST` | `smtp.office365.com` / `smtp.gmail.com` |
| `SMTP_PORT` | `587` |
| `SMTP_USER` | `faturamento@empresa.com.br` |
| `SMTP_PASS` | senha (ou senha de app) |
| `SMTP_FROM` | `Faturamento DOC <faturamento@empresa.com.br>` |

Se as variáveis `MS_*` estiverem preenchidas, o sistema usa o Microsoft Graph e ignora o SMTP.

> **Plano da Vercel.** O plano *Hobby* é para uso pessoal e não comercial, e o Blob gratuito tem limite de **2.000 gravações por mês**. Se o limite estourar, o Blob fica bloqueado por 30 dias. Para uso na empresa, use o plano **Pro**. Nele o consumo deste sistema custa centavos por mês.

---

## Outras formas de rodar

**Computador ou servidor próprio (Node 20+)**: os dados ficam na pasta `.data`.

```bash
npm install
npm run build
ADMIN_EMAILS=voce@empresa.com.br npm start      # http://localhost:3000
```

**Docker**: os dados ficam no volume `/data`.

```bash
docker build -t faturamento-medico .
docker run -d -p 3000:3000 -v faturamento-dados:/data -e ADMIN_EMAILS=voce@empresa.com.br faturamento-medico
```

**Desenvolvimento**:

```bash
npm install
npm run dev      # http://localhost:5173, recarga automática; dados em .data/
npm test         # regras de cálculo, armazenamento e API
```

Para desenvolver usando o Blob da Vercel em vez da pasta local: `vercel link`, depois `vercel env pull .env` e `npm run dev`.

---

## Backup

- **Vercel**: Storage › seu Blob › é possível baixar os arquivos. Ou use a CLI: `vercel blob list`.
- **Servidor próprio ou Docker**: copie a pasta `.data` ou o volume `/data`.

Os arquivos são JSON legíveis: `db/contratos/*.json`, `db/fechamentos/*.json`…

---

## Regras de cálculo (resumo)

| Item | Regra |
|---|---|
| Base da escala | Definida em cada tabela de valores. **Pagamento**: planejada, realizada ou apurada. **Faturamento**: planejada, realizada, apurada ou **valor fixo mensal**. Itens por hora usam as horas da base escolhida; itens por plantão contam os plantões (todos, realizados ou apurados). **Consulta/procedimento** são informados na conferência. |
| Pagamento | Qtd a pagar × valor a pagar do item. Se houver valor diferenciado para o médico, ele prevalece. Com a fonte "Pega Plantão" e base apurada, usa o *Total (Tolerância)*. |
| Faturamento | Qtd a faturar × valor a faturar do item. No valor fixo mensal, o valor é rateado entre as linhas pela quantidade apurada. |
| DS / FDS | Cada item vale para dia de semana (seg–sex), fim de semana (sáb–dom) ou ambos, pelo dia em que o plantão começa (coluna *Dia da Semana*). Feriados contam pelo dia da semana. Plantões de fim de semana sem item são vinculados como `Setor#FDS`. |
| Vigência das tabelas | Data (dd/mm/aaaa). O fechamento usa a tabela vigente no último dia do período do relatório; a competência inteira usa essa tabela. |
| Empresas de faturamento | Cada empresa tem código, alíquotas (ISS, PIS, COFINS, CSLL, IR) e vínculos (Sócio, PJ, CLT). Cada item indica sua empresa; há um pedido de NF por empresa e os impostos são calculados por empresa. |
| Empresa pagadora | Item do contrato > cadastro do médico > contrato. Médico pago por duas empresas tem uma linha por empresa na folha (taxa de sócio uma vez só). |
| Base médica | Interna, por contrato (Médicos: incluir, editar, excluir ou importar a planilha). A importação do Pega Plantão não cadastra nem altera médicos; plantões de CRMs fora da base ficam de fora do fechamento e são listados na conferência. |
| Vínculos | Sócio, RPA, PJ, Concursado e Cooperado. Um médico pode ter um 2º vínculo, que vale para as especialidades/tipos marcadas nele. |
| Folha do ERP | Só Sócio, PJ e RPA. Os demais vínculos aparecem em “Fora da folha”. Incluir, alterar ou excluir médico na folha exige justificativa e fica no log. |
| Glosa | Perguntada no pedido de NF (médico, CR, local/tipo, especialidade, horas, valor e se o médico foi pago). O valor é descontado do pedido de NF e aparece no dashboard em “Glosas por CR”. |
| Margem operacional | Faturamento − pagamento. |
| Metas | Cada item do contrato pode ter valores a faturar e a pagar para as metas mínima, mediana e máxima. A meta escolhida na conferência define os valores usados; meta sem valor usa o valor padrão do item. |
| Retenções NF PJ | Médico PJ não optante do Simples: PIS 0,65%, COFINS 3%, CSLL 1% e IR 1,5% sobre o bruto (editáveis em Administração), descontados na folha e mostrados na solicitação de NF. |
| Taxa de sócio | R$ 150 para vínculo SÓCIO acima de 24 h e com valor a receber (configurável por contrato). |
| Nº documento (ERP) | Nº do contrato + MM + AA (ex.: 986870726). |
| Cód. reduzido | Sigla do CR + MM + AA (ex.: PAP0726). |
| Vencimento | Último dia do mês seguinte à competência (editável). |
| Naturezas | Honorários 120101 · PJ 120102 · RPA 120103 · Pró-Labore 120104 (editáveis). |
| Perfis | Administrador, Faturamento, Aprovador, Folha/Financeiro, **Fiscal** (impostos e dados do PENF do contrato), **Departamento Pessoal** (aprova pró-labore) e Consulta. |
| Saldo remanescente | Valor global do contrato − faturamento aprovado acumulado. |
| Tempo de fechamento | Da importação até o último entre *Emitir pedido de NF* e *Gerar folha*. |

Os testes em `tests/core.test.js` reproduzem o fechamento PAP 07/2026:

- faturamento de R$ 323.461,04;
- pagamento de R$ 284.600,00;
- taxa de sócio de R$ 2.400 e líquido de R$ 282.200,00.

---

## Observações

- **SheetJS**: o projeto usa `xlsx@0.18.5`, a última versão publicada no npm. Versões mais novas são distribuídas pelo CDN da SheetJS. Para atualizar, troque a dependência por `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` e rode `npm install`.
- **Segurança**: o Blob é privado (nenhum arquivo tem link público), as senhas são guardadas só como hash, e a API recusa pedidos vindos de outros sites. A chave de assinatura das sessões é gerada sozinha no primeiro uso. Para definir a sua, use a variável `SESSION_SECRET`; trocá-la desconecta todos os usuários.
