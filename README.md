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
| Quantidade base | Itens por **hora** usam as horas apuradas (tolerância). Itens por **plantão** usam o nº de plantões com horas apuradas. **Consulta/procedimento** são informados na conferência. |
| Pagamento | Qtd a pagar × valor a pagar do item. Se houver valor diferenciado para o médico, ele prevalece. Com a fonte "Pega Plantão", usa o *Total (Tolerância)*. |
| Faturamento | Qtd a faturar × valor a faturar do item. |
| Margem operacional | Faturamento − pagamento. |
| Taxa de sócio | R$ 150 para vínculo SÓCIO acima de 24 h e com valor a receber (configurável por contrato). |
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

- **SheetJS**: o projeto usa `xlsx@0.18.5`, a última versão publicada no npm. Versões mais novas são distribuídas pelo CDN da SheetJS. Para atualizar, troque a dependência por `"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"` e rode `npm install`.
- **Segurança**: o Blob é privado (nenhum arquivo tem link público), as senhas são guardadas só como hash, e a API recusa pedidos vindos de outros sites. A chave de assinatura das sessões é gerada sozinha no primeiro uso. Para definir a sua, use a variável `SESSION_SECRET`; trocá-la desconecta todos os usuários.
