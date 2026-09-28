# Saber Espiritual

Site responsivo de consultas por chat com créditos por minuto, dois perfis iniciais, cadastro de novos atendentes e checkout Mercado Pago. A interface funciona em computador e celular e possui um modo de demonstração automático quando os serviços online ainda não estão configurados.

## O que já está pronto

- Página comercial responsiva e leve, com arte própria e instalação como aplicativo (PWA).
- Cadastro, login e recuperação de senha pelo Supabase.
- Carteira de créditos e histórico de movimentações.
- Pacotes de 7, 15, 30 e 60 minutos.
- Checkout Mercado Pago para Pix e cartão.
- Webhook assinado: os créditos só entram depois da confirmação do Mercado Pago.
- Chat em tempo real, fila de espera e aceite do atendimento.
- Cobrança automática de 1 crédito por minuto.
- Pausa da cobrança quando cliente ou atendente ficam desconectados por mais de 90 segundos.
- Área do atendente para ficar online/offline e aceitar clientes.
- Área administrativa para cadastrar novos atendentes.
- Políticas de privacidade, termos de uso e reembolso.

## Antes de publicar

Você precisará de três contas gratuitas:

1. **Supabase** — cadastro, banco de dados e chat em tempo real.
2. **Mercado Pago** — recebimento por Pix e cartão.
3. **Netlify** — hospedagem do site e das funções seguras.

Nunca envie as chaves privadas por WhatsApp, e-mail ou chat. Cadastre-as diretamente no painel do Netlify.

## 1. Criar o banco no Supabase

1. Crie um projeto em [supabase.com](https://supabase.com/).
2. Abra **SQL Editor**, crie uma consulta nova e cole todo o conteúdo de `supabase/schema.sql`.
3. Execute a consulta uma única vez.
4. Em **Authentication > URL Configuration**, informe temporariamente a URL do Netlify. Depois de publicar, substitua pela URL definitiva.
5. Em **Project Settings > API**, anote:
   - Project URL;
   - chave pública `anon`;
   - chave privada `service_role`.

### Criar os dois atendentes iniciais

Primeiro, publique o site e crie normalmente duas contas usando os e-mails reais de acesso. Depois volte ao **SQL Editor** e execute, trocando somente os e-mails:

```sql
select public.bootstrap_consultant(
  'seu-email-real@exemplo.com',
  'Rafael Oríon',
  'Baralho Cigano • Orientação espiritual',
  'Leituras objetivas sobre relacionamentos, decisões, caminhos profissionais e equilíbrio emocional.',
  true
);

select public.bootstrap_consultant(
  'email-da-esposa@exemplo.com',
  'Lívia Sol',
  'Tarot • Terapias energéticas',
  'Escuta acolhedora e leitura simbólica para questões afetivas, autoestima, escolhas e novos ciclos.',
  false
);
```

O primeiro perfil será administrador e atendente; o segundo será atendente. Depois disso, novos profissionais podem ser criados pela área administrativa do próprio site.

## 2. Configurar o Mercado Pago

1. Acesse [Mercado Pago Developers](https://www.mercadopago.com.br/developers/).
2. Crie uma aplicação de **Checkout Pro**.
3. Comece com as credenciais de teste.
4. No Mercado Pago, cadastre este endereço para notificações Webhook:

```text
https://SEU-SITE.netlify.app/.netlify/functions/mercadopago-webhook
```

5. Selecione o evento **Pagamentos** e guarde a assinatura secreta do Webhook.
6. Só troque para credenciais de produção depois de concluir uma compra de teste.

## 3. Publicar no Netlify

A forma mais confiável é subir esta pasta inteira em um repositório GitHub e conectar o repositório ao Netlify. O arquivo `netlify.toml` já informa a pasta pública e as funções.

No painel do Netlify:

1. Escolha **Add new site > Import an existing project**.
2. Conecte o repositório.
3. Deixe o comando de build vazio.
4. Confirme `dist` como diretório de publicação.
5. Em **Site configuration > Environment variables**, cadastre:

| Variável | Valor |
|---|---|
| `SUPABASE_URL` | URL do projeto Supabase |
| `SUPABASE_ANON_KEY` | chave pública `anon` |
| `SUPABASE_SERVICE_ROLE_KEY` | chave privada `service_role` |
| `MERCADO_PAGO_ACCESS_TOKEN` | token da aplicação Mercado Pago |
| `MERCADO_PAGO_WEBHOOK_SECRET` | assinatura secreta do Webhook |
| `MP_USE_SANDBOX` | `true` nos testes; `false` em produção |
| `SITE_URL` | URL completa do site, sem barra no final |
| `SITE_NAME` | `Saber Espiritual` |

6. Faça um novo deploy após salvar as variáveis.

Também é possível publicar pelo terminal, dentro desta pasta:

```bash
npx netlify-cli login
npx netlify-cli init
npx netlify-cli deploy --prod
```

O simples envio apenas da pasta `dist` não ativa pagamentos, chat nem cobrança, porque essas partes dependem das funções dentro de `netlify/functions`.

## 4. Teste obrigatório antes das vendas

1. Cadastre um cliente de teste.
2. Faça uma compra usando o ambiente de teste do Mercado Pago.
3. Confirme se os créditos aparecem na carteira.
4. Entre com Rafael ou Lívia e clique em **Ficar online**.
5. Solicite uma consulta pela conta do cliente.
6. Aceite pela conta do atendente em outro navegador ou celular.
7. Envie mensagens dos dois lados.
8. Aguarde pelo menos dois minutos e confirme o desconto.
9. Desligue a internet de um lado por mais de 90 segundos e confirme a pausa.
10. Encerre o chat e confira o histórico.

## 5. Dados que precisam ser personalizados

Antes de aceitar pagamentos ou anunciar no Google, altere os arquivos `dist/termos.html`, `dist/privacidade.html` e `dist/reembolso.html` com:

- nome do responsável ou da empresa;
- CPF/CNPJ, quando aplicável;
- e-mail e WhatsApp de suporte;
- endereço comercial exigido pela sua situação jurídica;
- prazo real de resposta e política de reembolso.

As leituras estão descritas como orientação simbólica, sem promessa de resultado e sem substituir serviços médicos, psicológicos, jurídicos ou financeiros. Preserve esses avisos em anúncios e páginas.

## Uso local

Abrir `dist/index.html` diretamente no navegador ativa o modo de demonstração. Para testar as funções localmente, instale o Netlify CLI e execute:

```bash
npm run dev
```

## Estrutura

- `dist/` — site público.
- `netlify/functions/` — pagamento, autenticação segura, sessões e cobrança.
- `supabase/schema.sql` — banco, permissões e regras de negócio.
- `.env.example` — nomes das variáveis necessárias.
- `netlify.toml` — publicação, segurança e agendamento da cobrança.

## Observação de capacidade

O projeto foi planejado para começar com dois atendentes e crescer. A operação inicial cabe normalmente nos planos gratuitos, mas uso intenso de chat, banco, funções agendadas ou transferência poderá exigir plano pago conforme os limites vigentes de cada fornecedor.
