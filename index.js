'use strict';

require('dotenv').config();

const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
} = require('discord.js');

// ============================================================
// CONFIGURAÇÕES
// ============================================================

const EMBED_COLOR = 0x9B59B6;

const FOOTER_TEXT = '🔥 𝙎𝙣𝙞𝙥𝙚𝙭ᴸᵘᵃ ᶜᵒᵐᵐᵘⁿⁱᵗʸ 👻';

const FOOTER_IMAGE =
  'https://cdn.discordapp.com/attachments/1381714599442649138/1490162386122965042/file_000000008870720e9825f146362ee8a53.png?ex=69d30d5e&is=69d1bbde&hm=a83ebf55961971ff22a936acc7a300f46b6d55c568a21d6771d3a7cfde1a369b&';

const ALLOWED_USER_ID = '1030955815114391592';

const ADMIN_USER_IDS = [
  '1030955815114391592',
];

const SELLERS_ROLE_ID = '1397770120910209146';

const AUTO_CLOSE_DELAY_MS = 5 * 60 * 1000;

const CHANNEL_DELETE_DELAY_MS = 5 * 1000;

const MAX_TICKETS_PER_USER = 2;

const VENDORS = [
  { label: 'Kpax',    value: '1030955815114391592', description: 'Escolha o Vendedor Kpax para trocar ou comprar.' },
  { label: 'KZ',      value: '1404535359886463137', description: 'Escolha o Vendedor KZ para trocar ou comprar.' },
  { label: 'Japa',    value: '1411787311884140574', description: 'Escolha o vendedor Japa para trocar ou comprar.' },
  { label: 'Kiwi',    value: '1351698009800310804', description: 'Escolha o vendedor Kiwi para trocar ou comprar.' },
  { label: 'Spectre', value: '1267640943633240096', description: 'Escolha o vendedor Spectre para trocar ou comprar.' },
  { label: 'Menor',   value: '1452255685357080638', description: 'Escolha o vendedor Menor para trocar ou comprar.' },
  { label: 'Lordz',   value: '1261370166172979220', description: 'Escolha o vendedor Lordz para trocar ou comprar.' },
  { label: 'Oruam',   value: '1395226016624017571', description: 'Escolha o vendedor Oruam para trocar ou comprar.' },
  { label: 'Laura',   value: '1236426708110934110', description: 'Escolha o vendedor Laura para trocar ou comprar.' },
  { label: 'Baby',    value: '1146443214312718396', description: 'Escolha o vendedor Baby para trocar ou comprar.' },
  { label: 'Vitinho', value: '1488268986209538389', description: 'Escolha o vendedor Vitinho para trocar ou comprar.' },
];

// ============================================================
// TICKET STORE (memória + recuperação pelo tópico do canal)
// ============================================================

const ticketStore = new Map();
const userTicketCount = new Map();

function getUserTicketCount(userId) {
  return userTicketCount.get(userId) || 0;
}

function incrementUserTickets(userId) {
  userTicketCount.set(userId, getUserTicketCount(userId) + 1);
}

function decrementUserTickets(userId) {
  const current = getUserTicketCount(userId);
  if (current <= 1) userTicketCount.delete(userId);
  else userTicketCount.set(userId, current - 1);
}

function hasReachedTicketLimit(userId) {
  return getUserTicketCount(userId) >= MAX_TICKETS_PER_USER;
}

function createTicket(channelId, data) {
  ticketStore.set(channelId, {
    creatorId: data.creatorId,
    vendorId: data.vendorId || null,
    type: data.type,
    selectedItem: null,
    itemEmbedMessageId: data.itemEmbedMessageId || null,
    welcomeEmbedMessageId: data.welcomeEmbedMessageId || null,
    vendorResponded: false,
    closeTimer: null,
  });
  incrementUserTickets(data.creatorId);
}

function restoreTicket(channelId, data) {
  if (ticketStore.has(channelId)) return ticketStore.get(channelId);
  ticketStore.set(channelId, {
    creatorId: data.creatorId,
    vendorId: data.vendorId || null,
    type: data.type,
    selectedItem: null,
    itemEmbedMessageId: null,
    welcomeEmbedMessageId: null,
    vendorResponded: false,
    closeTimer: null,
  });
  return ticketStore.get(channelId);
}

function getTicket(channelId) {
  return ticketStore.get(channelId) || null;
}

function getTicketWithRecovery(channel) {
  const cached = ticketStore.get(channel.id);
  if (cached) return cached;

  const topic = channel.topic;
  if (!topic) return null;

  if (topic.startsWith('compra:')) {
    const parts = topic.split(':');
    if (parts.length === 3) {
      const [, creatorId, vendorId] = parts;
      return restoreTicket(channel.id, { creatorId, vendorId, type: 'buy' });
    }
  } else if (topic.startsWith('venda:')) {
    const parts = topic.split(':');
    if (parts.length === 2) {
      const [, creatorId] = parts;
      return restoreTicket(channel.id, { creatorId, vendorId: null, type: 'sell' });
    }
  }

  return null;
}

function updateTicket(channelId, updates) {
  const ticket = ticketStore.get(channelId);
  if (!ticket) return;
  Object.assign(ticket, updates);
}

function deleteTicket(channelId) {
  const ticket = ticketStore.get(channelId);
  if (ticket) {
    if (ticket.closeTimer) clearTimeout(ticket.closeTimer);
    decrementUserTickets(ticket.creatorId);
  }
  ticketStore.delete(channelId);
}

function canCloseTicket(channel, userId, memberRoles, sellersRoleId) {
  const ticket = getTicketWithRecovery(channel);
  if (!ticket) return false;
  if (ticket.creatorId === userId) return true;
  if (ticket.type === 'buy' && ticket.vendorId === userId) return true;
  if (ticket.type === 'sell' && memberRoles.has(sellersRoleId)) return true;
  return false;
}

// ============================================================
// PERMISSÕES DE ADMIN
// ============================================================

function isAdmin(guild, userId) {
  if (userId === guild.ownerId) return true;
  if (ADMIN_USER_IDS.includes(userId)) return true;
  return false;
}

async function buildAdminOverwrites(guild) {
  const allIds = [...new Set([...ADMIN_USER_IDS, guild.ownerId])];
  const ADMIN_ALLOW = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
  const overwrites = [];
  for (const id of allIds) {
    try {
      const member = await guild.members.fetch(id);
      overwrites.push({ id: member, allow: ADMIN_ALLOW });
    } catch {}
  }
  return overwrites;
}

// ============================================================
// EMBEDS
// ============================================================

function applyDefaults(embed) {
  return embed
    .setColor(EMBED_COLOR)
    .setImage(FOOTER_IMAGE)
    .setFooter({ text: FOOTER_TEXT });
}

function buildMainPanelEmbed() {
  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🎫 Sistema Oficial de Tickets — 🔥 𝙎𝙣𝙞𝙥𝙚𝙭ᴸᵘᵃ ᶜᵒᵐᵐᵘⁿⁱᵗʸ 👻')
      .setDescription(
        'Nosso sistema de tickets foi criado para facilitar compras e vendas dentro do servidor, mantendo tudo organizado, seguro e rápido.\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**1 - Ticket de Compra**\n' +
        'Abra um Ticket de Compra caso você queira comprar um item.\n\n' +
        '✅ Escolha um vendedor específico\n' +
        '✅ Apenas você e o vendedor escolhido terão acesso\n' +
        '✅ Atendimento rápido e privado\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**2 - Ticket de Venda**\n' +
        'Abra um Ticket de Venda caso queira vender seus itens.\n\n' +
        '✅ Todos vendedores autorizados podem visualizar\n' +
        '✅ Primeiro vendedor disponível atende\n' +
        '✅ Processo rápido\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**3 - Regras Importantes**\n\n' +
        '• Não envie Pix antes de confirmar o vendedor\n' +
        '• Utilize apenas tickets oficiais\n' +
        '• Evite negociações fora do servidor\n' +
        '• Staff não se responsabiliza fora dos tickets\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**4 - Atendimento**\n\n' +
        '🔥 Atendimento rápido • organizado • seguro\n\n' +
        '━━━━━━━━━━━━━━━━━━'
      )
  );
}

function buildItemSelectionEmbed(item = null) {
  const itemDisplay = item ? item : 'Aguardando...';
  const status = item
    ? '✅ Item selecionado! Aguardando o vendedor...'
    : '⏳ Status: Aguardando seleção do item...';

  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🛒 Sistema de Seleção de Item')
      .setDescription(
        'Para continuar com sua compra ou troca, informe abaixo qual item você deseja.\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**1 - Item Selecionado**\n' +
        `Item: **${itemDisplay}**\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**2 - Como Selecionar**\n\n' +
        'Clique no botão **Selecionar Item** abaixo.\n\n' +
        'Após clicar:\n' +
        '• Um campo de texto será aberto\n' +
        '• Digite o nome do item desejado\n' +
        '• Após confirmação → embed atualizado automaticamente\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**3 - Regras de Seleção**\n\n' +
        '• Apenas o criador do ticket pode selecionar\n' +
        '• Evite múltiplas mensagens\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `**4 - Status do Pedido**\n\n${status}\n\n` +
        '━━━━━━━━━━━━━━━━━━'
      )
  );
}

function buildCloseEmbed() {
  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🔒 Encerrar Atendimento')
      .setDescription('Quando o atendimento for finalizado, utilize o botão abaixo para fechar o ticket.')
  );
}

function buildClosingEmbed() {
  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🔒 Ticket Encerrado')
      .setDescription('✅ O atendimento foi encerrado.\n\nEste canal será deletado em **5 segundos**...')
  );
}

function buildSellTicketWelcomeEmbed(responded = false) {
  const status = responded
    ? '✅ **Status:** Vendedor respondeu! Atendimento em andamento...'
    : '⏳ **Status:** Aguardando resposta do vendedor...';

  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🔔 Ticket Criado com Sucesso')
      .setDescription(
        '**Seu ticket foi aberto corretamente. Aguarde enquanto um vendedor responde neste canal.**\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**1 - Ticket Registrado**\n' +
        '> - **Seu pedido foi enviado para a equipe de vendedores.**\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**2 - Aguarde uma Resposta**\n' +
        '> - **Um vendedor responderá aqui em breve.**\n' +
        '> - **Permaneça neste canal para continuar o atendimento.**\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**3 - Durante a Espera**\n' +
        '> - **Evite enviar múltiplas mensagens.**\n' +
        '> - **Não marque membros ou vendedores sem necessidade.**\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**4 - Status do Ticket**\n' +
        `> - ${status}\n\n` +
        '━━━━━━━━━━━━━━━━━━'
      )
  );
}

function buildVendorSelectEmbed() {
  return applyDefaults(
    new EmbedBuilder()
      .setTitle('🛍️ Selecionar Vendedor')
      .setDescription(
        'Escolha um vendedor da lista abaixo para abrir um ticket privado de compra ou troca.\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '✅ Apenas você e o vendedor selecionado terão acesso ao ticket.\n' +
        '✅ Atendimento rápido e privado.\n\n' +
        '━━━━━━━━━━━━━━━━━━'
      )
  );
}

// ============================================================
// AUTO-CLOSE
// ============================================================

function scheduleAutoClose(channel, channelId) {
  const timer = setTimeout(async () => {
    try {
      if (!channel.deletable) return;

      const closeRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('🔴 Fechar')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [buildCloseEmbed()], components: [closeRow] });
    } catch {}
  }, AUTO_CLOSE_DELAY_MS);

  updateTicket(channelId, { closeTimer: timer });
}

// ============================================================
// HANDLER: SLASH COMMAND /painel_dos_vendedores
// ============================================================

async function handleCommand(interaction) {
  if (interaction.commandName !== 'painel_dos_vendedores') return;

  if (interaction.user.id !== ALLOWED_USER_ID) {
    return interaction.reply({
      content: '❌ Você não tem permissão para usar este comando.',
      flags: 64,
    });
  }

  const buyButton = new ButtonBuilder()
    .setCustomId('ticket_buy')
    .setLabel('Comprar/Trocar')
    .setStyle(ButtonStyle.Success);

  const sellButton = new ButtonBuilder()
    .setCustomId('ticket_sell')
    .setLabel('Vender')
    .setStyle(ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(buyButton, sellButton);

  await interaction.reply({ content: '✅', flags: 64 });
  await interaction.channel.send({ embeds: [buildMainPanelEmbed()], components: [row] });
  await interaction.deleteReply().catch(() => {});
}

// ============================================================
// HANDLER: BOTÃO COMPRAR
// ============================================================

async function handleBuyButton(interaction) {
  if (hasReachedTicketLimit(interaction.user.id)) {
    return interaction.reply({
      content: `❌ Você já possui **${MAX_TICKETS_PER_USER} tickets** abertos. Feche um antes de abrir outro.`,
      flags: 64,
    });
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('vendor_select')
    .setPlaceholder('Escolha um vendedor...')
    .addOptions(VENDORS.map((v) => ({ label: v.label, value: v.value, description: v.description })));

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({ embeds: [buildVendorSelectEmbed()], components: [row], flags: 64 });
}

// ============================================================
// HANDLER: BOTÃO VENDER
// ============================================================

async function handleSellButton(interaction) {
  if (hasReachedTicketLimit(interaction.user.id)) {
    return interaction.reply({
      content: `❌ Você já possui **${MAX_TICKETS_PER_USER} tickets** abertos. Feche um antes de abrir outro.`,
      flags: 64,
    });
  }

  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
  const creatorMember = interaction.member;
  const creator = interaction.user;

  const existing = guild.channels.cache.find((ch) => ch.topic === `venda:${creator.id}`);
  if (existing) {
    return interaction.editReply({ content: `❌ Você já possui um ticket de venda aberto: ${existing}` });
  }

  const sellersRole = guild.roles.cache.get(SELLERS_ROLE_ID) ?? await guild.roles.fetch(SELLERS_ROLE_ID);
  const adminOverwrites = await buildAdminOverwrites(guild);

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: creatorMember,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    },
    ...adminOverwrites,
  ];

  if (sellersRole) {
    permissionOverwrites.push({
      id: sellersRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
    });
  }

  const safeName = creator.username.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 32);

  const channel = await guild.channels.create({
    name: `ticket-venda-${safeName}`,
    topic: `venda:${creator.id}`,
    permissionOverwrites,
  });

  createTicket(channel.id, { creatorId: creator.id, vendorId: null, type: 'sell' });

  await channel.send({ content: `👋 ${creator} seu ticket de venda foi aberto!` });

  const welcomeMsg = await channel.send({ embeds: [buildSellTicketWelcomeEmbed(false)] });
  updateTicket(channel.id, { welcomeEmbedMessageId: welcomeMsg.id });

  scheduleAutoClose(channel, channel.id);

  await interaction.editReply({ content: `✅ Seu ticket de venda foi criado: ${channel}` });
}

// ============================================================
// HANDLER: BOTÃO FECHAR
// ============================================================

async function handleCloseButton(interaction) {
  await interaction.deferReply();

  const channel = interaction.channel;
  const userId = interaction.user.id;
  const memberRoles = interaction.member.roles.cache;

  const admin = isAdmin(interaction.guild, userId);
  const canClose = admin || canCloseTicket(channel, userId, memberRoles, SELLERS_ROLE_ID);

  if (!canClose) {
    return interaction.editReply({
      content: '❌ Apenas o criador do ticket ou o vendedor responsável podem fechá-lo.',
    });
  }

  await interaction.editReply({ embeds: [buildClosingEmbed()], components: [] });
  deleteTicket(channel.id);

  setTimeout(async () => {
    try { await channel.delete('Ticket encerrado pelo usuário.'); } catch {}
  }, CHANNEL_DELETE_DELAY_MS);
}

// ============================================================
// HANDLER: BOTÃO SELECIONAR ITEM
// ============================================================

async function handleSelectItemButton(interaction) {
  const ticket = getTicketWithRecovery(interaction.channel);
  const admin = isAdmin(interaction.guild, interaction.user.id);

  if (!ticket || (!admin && ticket.creatorId !== interaction.user.id)) {
    return interaction.reply({ content: '❌ Apenas o criador do ticket pode selecionar o item.', flags: 64 });
  }

  const modal = new ModalBuilder().setCustomId('item_select_modal').setTitle('Selecionar Item');

  const itemInput = new TextInputBuilder()
    .setCustomId('item_name')
    .setLabel('Nome do Item')
    .setPlaceholder('Ex: Brainrot X')
    .setStyle(TextInputStyle.Short)
    .setRequired(true)
    .setMaxLength(100);

  modal.addComponents(new ActionRowBuilder().addComponents(itemInput));
  await interaction.showModal(modal);
}

// ============================================================
// HANDLER: BOTÃO NOTIFICAR VENDEDOR
// ============================================================

async function handleNotifyVendorButton(interaction) {
  const ticket = getTicketWithRecovery(interaction.channel);
  const admin = isAdmin(interaction.guild, interaction.user.id);

  if (!ticket || (!admin && ticket.creatorId !== interaction.user.id)) {
    return interaction.reply({ content: '❌ Apenas o criador do ticket pode notificar o vendedor.', flags: 64 });
  }

  if (!ticket.vendorId) {
    return interaction.reply({ content: '❌ Nenhum vendedor associado a este ticket.', flags: 64 });
  }

  await interaction.reply({
    content: `🔔 <@${ticket.vendorId}>, você tem um cliente aguardando atendimento neste ticket!`,
  });
}

// ============================================================
// HANDLER: MENU DE SELEÇÃO DE VENDEDOR
// ============================================================

async function handleVendorSelect(interaction) {
  await interaction.deferReply({ flags: 64 });

  const guild = interaction.guild;
  const creatorMember = interaction.member;
  const creator = interaction.user;
  const vendorId = interaction.values[0];

  if (hasReachedTicketLimit(creator.id)) {
    return interaction.editReply({
      content: `❌ Você já possui **${MAX_TICKETS_PER_USER} tickets** abertos. Feche um antes de abrir outro.`,
    });
  }

  const vendor = VENDORS.find((v) => v.value === vendorId);
  const vendorLabel = vendor ? vendor.label : 'Vendedor';

  const existing = guild.channels.cache.find((ch) => ch.topic === `compra:${creator.id}:${vendorId}`);
  if (existing) {
    return interaction.editReply({
      content: `❌ Você já possui um ticket de compra com **${vendorLabel}** aberto: ${existing}`,
    });
  }

  let vendorMember;
  try {
    vendorMember = await guild.members.fetch(vendorId);
  } catch {
    return interaction.editReply({
      content: `❌ O vendedor **${vendorLabel}** não está no servidor ou não pôde ser encontrado. Avise um administrador.`,
    });
  }

  const channelName = `ticket-${vendorLabel.toLowerCase()}-${creator.username
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 32)}`;

  const adminOverwrites = await buildAdminOverwrites(guild);

  const channel = await guild.channels.create({
    name: channelName,
    topic: `compra:${creator.id}:${vendorId}`,
    permissionOverwrites: [
      { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: creatorMember,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      {
        id: vendorMember,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      },
      ...adminOverwrites,
    ],
  });

  createTicket(channel.id, { creatorId: creator.id, vendorId, type: 'buy' });

  const selectItemRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_select_item').setLabel('🛒 Selecionar Item').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('ticket_notify_vendor').setLabel('🔔 Notificar Vendedor').setStyle(ButtonStyle.Success)
  );

  await channel.send({
    content:
      `👋 Olá ${creator}! Seu ticket de compra/troca com **${vendorLabel}** foi aberto.\n\n` +
      `<@${vendorId}>, você foi chamado para atender este ticket.`,
  });

  const itemMsg = await channel.send({ embeds: [buildItemSelectionEmbed(null)], components: [selectItemRow] });
  updateTicket(channel.id, { itemEmbedMessageId: itemMsg.id });

  scheduleAutoClose(channel, channel.id);

  await interaction.editReply({
    content: `✅ Seu ticket de compra/troca com **${vendorLabel}** foi criado: ${channel}`,
  });
}

// ============================================================
// HANDLER: MODAL — NOME DO ITEM
// ============================================================

async function handleItemSelectModal(interaction) {
  const ticket = getTicketWithRecovery(interaction.channel);
  const admin = isAdmin(interaction.guild, interaction.user.id);

  if (!ticket || (!admin && ticket.creatorId !== interaction.user.id)) {
    return interaction.reply({ content: '❌ Apenas o criador do ticket pode selecionar o item.', flags: 64 });
  }

  const itemName = interaction.fields.getTextInputValue('item_name').trim();

  if (!itemName) {
    return interaction.reply({ content: '❌ O nome do item não pode estar vazio.', flags: 64 });
  }

  updateTicket(interaction.channel.id, { selectedItem: itemName });
  await interaction.deferUpdate();

  const { itemEmbedMessageId } = ticket;

  const selectItemRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ticket_select_item').setLabel('🛒 Selecionar Item').setStyle(ButtonStyle.Primary)
  );

  if (itemEmbedMessageId) {
    try {
      const msg = await interaction.channel.messages.fetch(itemEmbedMessageId);
      await msg.edit({ embeds: [buildItemSelectionEmbed(itemName)], components: [selectItemRow] });
    } catch {
      await interaction.channel.send({ embeds: [buildItemSelectionEmbed(itemName)] });
    }
  } else {
    await interaction.channel.send({ embeds: [buildItemSelectionEmbed(itemName)] });
  }
}

// ============================================================
// HANDLER: MENSAGENS (atualiza status quando vendedor responde)
// ============================================================

async function handleMessage(message) {
  if (message.author.bot) return;
  if (!message.guild) return;

  const ticket = getTicketWithRecovery(message.channel);
  if (!ticket || ticket.type !== 'sell') return;
  if (ticket.vendorResponded) return;

  const member = message.member;
  if (!member || !member.roles.cache.has(SELLERS_ROLE_ID)) return;

  updateTicket(message.channel.id, { vendorResponded: true });

  if (!ticket.welcomeEmbedMessageId) return;

  try {
    const msg = await message.channel.messages.fetch(ticket.welcomeEmbedMessageId);
    await msg.edit({ embeds: [buildSellTicketWelcomeEmbed(true)] });
  } catch (err) {
    console.error('[MessageHandler] Falha ao atualizar embed de venda:', err);
  }
}

// ============================================================
// HANDLER: TODAS AS INTERAÇÕES
// ============================================================

async function handleInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      switch (interaction.customId) {
        case 'ticket_buy':           return handleBuyButton(interaction);
        case 'ticket_sell':          return handleSellButton(interaction);
        case 'ticket_close':         return handleCloseButton(interaction);
        case 'ticket_select_item':   return handleSelectItemButton(interaction);
        case 'ticket_notify_vendor': return handleNotifyVendorButton(interaction);
      }
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'vendor_select') return handleVendorSelect(interaction);
      return;
    }

    if (interaction.isModalSubmit()) {
      if (interaction.customId === 'item_select_modal') return handleItemSelectModal(interaction);
      return;
    }
  } catch (error) {
    console.error('[Interaction Error]', error);
    const errorMsg = { content: '❌ Ocorreu um erro inesperado. Tente novamente.', flags: 64 };
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp(errorMsg);
      else await interaction.reply(errorMsg);
    } catch {}
  }
}

// ============================================================
// BOT — INICIALIZAÇÃO
// ============================================================

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;

if (!token) {
  console.error('❌ DISCORD_TOKEN não definido. Configure a variável de ambiente.');
  process.exit(1);
}

if (!clientId) {
  console.error('❌ DISCORD_CLIENT_ID não definido. Configure a variável de ambiente.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel, Partials.Message],
});

client.once('clientReady', async () => {
  console.log(`✅ Bot online como ${client.user.tag}`);
  console.log(`📌 ID do bot: ${client.user.id}`);
  console.log(`🌐 Em ${client.guilds.cache.size} servidor(es).`);

  const rest = new REST({ version: '10' }).setToken(token);

  const commands = [
    new SlashCommandBuilder()
      .setName('painel_dos_vendedores')
      .setDescription('Abre o painel oficial de tickets do servidor.')
      .setDefaultMemberPermissions(null)
      .setDMPermission(false)
      .toJSON(),
  ];

  try {
    await rest.put(Routes.applicationCommands(clientId), { body: commands });
    console.log('✅ Slash commands registrados com sucesso!');
  } catch (err) {
    console.error('❌ Erro ao registrar slash commands:', err);
  }
});

client.on('interactionCreate', handleInteraction);
client.on('messageCreate', handleMessage);

client.on('error', (error) => console.error('[Client Error]', error));
client.on('warn', (info) => console.warn('[Client Warn]', info));

process.on('unhandledRejection', (error) => console.error('[Unhandled Rejection]', error));
process.on('uncaughtException', (error) => console.error('[Uncaught Exception]', error));

client.login(token).catch((err) => {
  console.error('❌ Falha ao logar no Discord:', err.message);
  process.exit(1);
});
