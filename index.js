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

const FOOTER_IMAGE = 'https://cdn.discordapp.com/attachments/1381714599442649138/1490162386122965042/file_000000008870720e9825f146362ee8a53.png';

const THUMBNAIL_URL = 'https://cdn.discordapp.com/attachments/1381714599442649138/1497828948644462602/standard_1.gif';

const ALLOWED_USER_ID = '1030955815114391592';

const ADMIN_USER_IDS = [
  '1030955815114391592',
];

const SELLERS_ROLE_ID = '1397770120910209146';

const CHANNEL_DELETE_DELAY_MS = 0;

const MAX_TICKETS_PER_USER = 2;

const TICKETS_CATEGORY_ID = '1497714791303872623';

const REVIEW_CHANNEL_ID = '1437628585115648041';
const SALE_LOG_CHANNEL_ID = '1439400182142734509';
const COMPLETED_ROLE_ID = '1397781111219687485';

// Lista de vendedores (Vitinho removido)
const VENDORS = [
  { label: 'Kpax',    value: '1030955815114391592', description: 'Escolha o Vendedor Kpax para trocar ou comprar.' },
  { label: 'KZ',      value: '1404535359886463137', description: 'Escolha o Vendedor KZ para trocar ou comprar.' },
  { label: 'Japa',    value: '1411787311884140574', description: 'Escolha o vendedor Japa para trocar ou comprar.' },
  { label: 'Spectre', value: '1267640943633240096', description: 'Escolha o vendedor Spectre para trocar ou comprar.' },
  { label: 'Lordz',   value: '1261370166172979220', description: 'Escolha o vendedor Lordz para trocar ou comprar.' },
  { label: 'Pedro',   value: '1428541375896490087', description: 'Escolha o vendedor Pedro para trocar ou comprar.' },
  { label: 'Oruam',   value: '1395226016624017571', description: 'Escolha o vendedor Oruam para trocar ou comprar.' },
  { label: 'Laura',   value: '1236426708110934110', description: 'Escolha o vendedor Laura para trocar ou comprar.' },
  { label: 'Baby',    value: '1146443214312718396', description: 'Escolha o vendedor Baby para trocar ou comprar.' },
];

// ============================================================
// TICKET STORE
// ============================================================

const ticketStore = new Map();
const userTicketCount = new Map();
let ticketsCategory = null;
let saleCounter = 1;

// Persistência do contador
try {
  const fs = require('fs');
  if (fs.existsSync('./saleCounter.json')) {
    const data = JSON.parse(fs.readFileSync('./saleCounter.json', 'utf8'));
    saleCounter = data.saleCounter || 1;
  }
} catch (e) {}

function saveSaleCounter() {
  try {
    const fs = require('fs');
    fs.writeFileSync('./saleCounter.json', JSON.stringify({ saleCounter }, null, 2));
  } catch (e) {}
}

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
    vendorLabel: data.vendorLabel || null,
    type: data.type,
    selectedItem: null,
    itemSelected: false,
    ticketLogs: [],
    itemEmbedMessageId: data.itemEmbedMessageId || null,
    welcomeEmbedMessageId: data.welcomeEmbedMessageId || null,
  });
  incrementUserTickets(data.creatorId);
}

function restoreTicket(channelId, data) {
  if (ticketStore.has(channelId)) return ticketStore.get(channelId);
  ticketStore.set(channelId, {
    creatorId: data.creatorId,
    vendorId: data.vendorId || null,
    vendorLabel: data.vendorLabel || null,
    type: data.type,
    selectedItem: null,
    itemSelected: false,
    ticketLogs: [],
    itemEmbedMessageId: null,
    welcomeEmbedMessageId: null,
  });
  return ticketStore.get(channelId);
}

function getTicket(channelId) {
  return ticketStore.get(channelId) || null;
}

function addTicketLog(channelId, log) {
  const ticket = ticketStore.get(channelId);
  if (ticket) {
    ticket.ticketLogs.push({ timestamp: new Date().toISOString(), message: log });
  }
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
      const vendor = VENDORS.find(v => v.value === vendorId);
      return restoreTicket(channel.id, { creatorId, vendorId, vendorLabel: vendor?.label || 'Vendedor', type: 'buy' });
    }
  } else if (topic.startsWith('venda:')) {
    const parts = topic.split(':');
    if (parts.length === 2) {
      const [, creatorId] = parts;
      return restoreTicket(channel.id, { creatorId, vendorId: null, vendorLabel: null, type: 'sell' });
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
    decrementUserTickets(ticket.creatorId);
  }
  ticketStore.delete(channelId);
}

async function sendTicketLogsToUsers(ticket, channel) {
  const creator = await channel.guild.members.fetch(ticket.creatorId).catch(() => null);
  const vendor = ticket.vendorId ? await channel.guild.members.fetch(ticket.vendorId).catch(() => null) : null;

  const logsText = ticket.ticketLogs.map(log => `[${log.timestamp}] ${log.message}`).join('\n') || 'Nenhum log registrado.';
  
  const logEmbed = new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle(`📋 Logs do Ticket - ${channel.name}`)
    .setDescription(`**👤 Criador:** ${creator?.user?.tag || ticket.creatorId}\n**👨‍💼 Vendedor:** ${vendor?.user?.tag || ticket.vendorId || 'N/A'}\n**📦 Item:** ${ticket.selectedItem || 'Não selecionado'}\n**📝 Status:** ${ticket.itemSelected ? 'Item selecionado' : 'Item não selecionado'}\n\n**📜 Mensagens do Ticket:**\n\`\`\`${logsText.slice(0, 1900)}\`\`\``)
    .setFooter({ text: FOOTER_TEXT })
    .setThumbnail(THUMBNAIL_URL);

  if (creator) {
    await creator.send({ embeds: [logEmbed] }).catch(() => {});
  }
  if (vendor && vendor.id !== ticket.creatorId) {
    await vendor.send({ embeds: [logEmbed] }).catch(() => {});
  }
}

// ============================================================
// GERENCIAMENTO DA CATEGORIA
// ============================================================

async function getOrCreateTicketsCategory(guild) {
  if (ticketsCategory) return ticketsCategory;

  let category = guild.channels.cache.get(TICKETS_CATEGORY_ID);

  if (!category) {
    category = await guild.channels.create({
      name: "TICKETS",
      type: 4,
    });
    console.log(`[CATEGORY] Categoria criada com ID: ${category.id}`);
  }

  ticketsCategory = category;
  return category;
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
    PermissionFlagsBits.AttachFiles,
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

function applyTicketEmbed(embed) {
  return embed
    .setColor(EMBED_COLOR)
    .setThumbnail(THUMBNAIL_URL)
    .setFooter({ text: FOOTER_TEXT });
}

function buildMainPanelEmbed() {
  return new EmbedBuilder()
    .setColor(EMBED_COLOR)
    .setTitle('🎫 Sistema Oficial de Tickets — 🔥 𝙎𝙣𝙞𝙥𝙚𝙭ᴸᵘᵃ ᶜᵒᵐᵐᵘⁿⁱᵗʸ 👻')
    .setDescription(
      'Nosso sistema de tickets foi criado para facilitar compras e vendas dentro do servidor, mantendo tudo organizado, seguro e rápido.\n\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '**«1 - Ticket de Compra**\n\n' +
      '- Abra um Ticket de Compra caso queira adquirir um item.\n' +
      '- ✅ Escolha um vendedor específico\n' +
      '- ✅ Apenas você e o vendedor terão acesso\n' +
      '- ✅ Atendimento rápido e privado\n\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '**«2 - Ticket de Venda**\n\n' +
      '- Abra um Ticket de Venda caso queira vender seus itens.\n' +
      '- ✅ Todos os vendedores autorizados podem visualizar\n' +
      '- ✅ O primeiro vendedor disponível realizará o atendimento\n' +
      '- ✅ Processo rápido e organizado\n\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '**«3 - Regras Importantes**\n\n' +
      '- ⚠️ Não envie Pix antes de confirmar o vendedor\n' +
      '- ⚠️ Utilize apenas tickets oficiais\n' +
      '- ⚠️ Evite negociações fora do servidor\n' +
      '- ⚠️ A staff não se responsabiliza por acordos fora dos tickets\n\n' +
      '━━━━━━━━━━━━━━━━━━\n\n' +
      '**«4 - Atendimento**\n\n' +
      '- 🔥 Atendimento rápido\n' +
      '- 📋 Organização total\n' +
      '- 🔒 Segurança garantida\n\n' +
      '━━━━━━━━━━━━━━━━━━'
    )
    .setImage(FOOTER_IMAGE)
    .setFooter({ text: FOOTER_TEXT });
}

function buildItemSelectionEmbed(item = null, itemSelected = false) {
  const itemDisplay = item ? item : 'Aguardando...';
  let status;
  let selecionarItemText = '';
  
  if (itemSelected) {
    status = '✅ **Item selecionado com sucesso!**\n✅ Utilize os botões abaixo para finalizar o atendimento.';
    selecionarItemText = '✅ **Item já selecionado!** Escolha uma opção abaixo:';
  } else {
    status = '⏳ Status: Aguardando seleção do item...';
    selecionarItemText = 'Clique no botão **Selecionar Item** abaixo.';
  }

  return applyTicketEmbed(
    new EmbedBuilder()
      .setTitle('🛒 Sistema de Seleção de Item')
      .setDescription(
        'Para continuar com sua compra ou troca, informe abaixo qual item você deseja.\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**1 - Item Selecionado**\n' +
        `Item: **${itemDisplay}**\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '**2 - Como Selecionar**\n\n' +
        `${selecionarItemText}\n\n` +
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

function buildBuyTicketWelcomeEmbed(creator, vendorId) {
  const vendor = VENDORS.find(v => v.value === vendorId);
  const vendorName = vendor ? vendor.label : 'Vendedor';
  
  return applyTicketEmbed(
    new EmbedBuilder()
      .setTitle('🎫 Ticket criado com sucesso!')
      .setDescription(
        `Olá <@${creator.id}>, seu atendimento foi iniciado ✅\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `👤 **Usuário:**  \n${creator.username} (${creator.id})\n\n` +
        `📂 **Categoria:**  \nComprar/Trocar\n\n` +
        `👨‍💼 **Vendedor:**  \n${vendorName}\n\n` +
        `📦 **Item Selecionado:**  \nAguardando seleção...\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '⏳ Aguarde um vendedor assumir o atendimento.'
      )
  );
}

function buildSellTicketWelcomeEmbed(creator) {
  return applyTicketEmbed(
    new EmbedBuilder()
      .setTitle('🎫 Ticket criado com sucesso!')
      .setDescription(
        `Olá <@${creator.id}>, seu atendimento de **venda** foi iniciado ✅\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        `👤 **Usuário:**  \n${creator.username} (${creator.id})\n\n` +
        `📂 **Categoria Selecionada:**  \nVenda\n\n` +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '⏳ **Status:** Aguardando algum comprador responder...\n\n' +
        '━━━━━━━━━━━━━━━━━━\n\n' +
        '⚠️ Evite spam ou marcações desnecessárias enquanto aguarda.'
      )
  );
}

function buildVendorSelectEmbed() {
  return applyTicketEmbed(
    new EmbedBuilder()
      .setTitle('🛒 Escolha do Vendedor')
      .setDescription(
        'Selecione um vendedor da lista abaixo para abrir um ticket privado de compra ou troca.\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '✅ Apenas você e o vendedor escolhido terão acesso ao ticket\n' +
        '✅ Atendimento direto, rápido e privado\n' +
        '✅ Negociação segura dentro do servidor\n' +
        '━━━━━━━━━━━━━━━━━━\n' +
        '📌 Após selecionar, o ticket será criado automaticamente.'
      )
  );
}

// ============================================================
// HANDLER: SLASH COMMAND
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

  const category = await getOrCreateTicketsCategory(guild);

  const sellersRole = guild.roles.cache.get(SELLERS_ROLE_ID) ?? await guild.roles.fetch(SELLERS_ROLE_ID);
  const adminOverwrites = await buildAdminOverwrites(guild);

  const permissionOverwrites = [
    { id: guild.id, deny: [PermissionFlagsBits.ViewChannel] },
    {
      id: creatorMember,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    },
    ...adminOverwrites,
  ];

  if (sellersRole) {
    permissionOverwrites.push({
      id: sellersRole,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
    });
  }

  const safeName = creator.username.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-').slice(0, 32);

  const channel = await guild.channels.create({
    name: `ticket-venda-${safeName}`,
    topic: `venda:${creator.id}`,
    permissionOverwrites,
    parent: category.id,
  });

  createTicket(channel.id, { creatorId: creator.id, vendorId: null, type: 'sell' });

  const selectItemButton = new ButtonBuilder()
    .setCustomId('ticket_select_item')
    .setLabel('🛒 Selecionar Item')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(selectItemButton);

  const welcomeMsg = await channel.send({ 
    content: `<@${creator.id}>`,
    embeds: [buildSellTicketWelcomeEmbed(creator)],
    components: [row]
  });
  updateTicket(channel.id, { welcomeEmbedMessageId: welcomeMsg.id });

  await interaction.editReply({ content: `✅ Seu ticket de venda foi criado: ${channel}` });
}

// ============================================================
// HANDLER: BOTÃO FECHAR (CANCELADO/RESOLVIDO)
// ============================================================

async function handleCloseOptions(interaction, status) {
  const channel = interaction.channel;
  const userId = interaction.user.id;
  const ticket = getTicketWithRecovery(channel);

  if (!ticket) {
    return interaction.reply({ content: '❌ Ticket não encontrado.', flags: 64 });
  }

  // Apenas o vendedor pode fechar o ticket
  if (ticket.vendorId !== userId) {
    return interaction.reply({ content: '❌ Apenas o vendedor responsável pode fechar o ticket.', flags: 64 });
  }

  if (!ticket.itemSelected) {
    return interaction.reply({ content: '❌ O cliente precisa selecionar um item antes de fechar o ticket.', flags: 64 });
  }

  await interaction.deferUpdate();

  addTicketLog(channel.id, `Ticket ${status === 'cancelled' ? 'CANCELADO' : 'RESOLVIDO'} por <@${userId}>`);

  // Envia logs no PV
  await sendTicketLogsToUsers(ticket, channel);

  if (status === 'completed') {
    // Dá o cargo para o comprador
    const buyer = await channel.guild.members.fetch(ticket.creatorId).catch(() => null);
    const completedRole = channel.guild.roles.cache.get(COMPLETED_ROLE_ID);
    
    if (buyer && completedRole) {
      await buyer.roles.add(completedRole).catch(() => {});
    }

    // Envia mensagem de avaliação no PV do comprador
    if (buyer) {
      const reviewMsg = `⭐ **Avalie o Atendimento!!**

Seu atendimento foi finalizado!

Pedimos que deixe sua avaliação sobre o vendedor neste canal 👇

━━━━━━━━━━━━━━━━━━

✅ Atendimento foi rápido?
✅ Vendedor foi educado?
✅ Tudo ocorreu corretamente?

📝 Envie sua opinião ou nota para ajudar a manter o servidor seguro e organizado!!! 

<#${REVIEW_CHANNEL_ID}>

💜 Sua avaliação ajuda outros membros e melhora nosso atendimento!! 

<@${buyer.user.id}>`;
      
      await buyer.send({ content: reviewMsg }).catch(() => {});
    }

    // Envia embed no canal de logs de venda
    const saleLogChannel = channel.guild.channels.cache.get(SALE_LOG_CHANNEL_ID);
    if (saleLogChannel) {
      const vendor = VENDORS.find(v => v.value === ticket.vendorId);
      const vendorName = vendor ? vendor.label : 'Vendedor';
      
      const saleEmbed = new EmbedBuilder()
        .setColor(EMBED_COLOR)
        .setTitle('💲 Venda Concluída!')
        .setDescription(
          `**💵 Nova venda concluída com sucesso 😉**\n\n` +
          `**🩵 Proff Número #${saleCounter}**\n\n` +
          `• **Vendedor:** ${vendorName}\n` +
          `• **Comprador/Trocador:** <@${ticket.creatorId}>`
        )
        .setThumbnail(THUMBNAIL_URL)
        .setFooter({ text: FOOTER_TEXT });
      
      await saleLogChannel.send({ embeds: [saleEmbed] });
      saleCounter++;
      saveSaleCounter();
    }
  }

  deleteTicket(channel.id);

  setTimeout(async () => {
    try { 
      await channel.delete(`Ticket ${status === 'cancelled' ? 'cancelado' : 'resolvido'} pelo vendedor.`);
      if (channel.guild) {
        const category = channel.guild.channels.cache.get(TICKETS_CATEGORY_ID);
        const channelsInCategory = channel.guild.channels.cache.filter(
          (ch) => ch.parentId === TICKETS_CATEGORY_ID
        );
        if (channelsInCategory.size === 0 && category) {
          await category.delete();
          ticketsCategory = null;
        }
      }
    } catch {}
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

  if (ticket.itemSelected) {
    return interaction.reply({ 
      content: '❌ Você já selecionou um item para este ticket!',
      flags: 64 
    });
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

  const category = await getOrCreateTicketsCategory(guild);

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
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: vendorMember,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      ...adminOverwrites,
    ],
    parent: category.id,
  });

  createTicket(channel.id, { creatorId: creator.id, vendorId, vendorLabel, type: 'buy' });

  const selectItemButton = new ButtonBuilder()
    .setCustomId('ticket_select_item')
    .setLabel('🛒 Selecionar Item')
    .setStyle(ButtonStyle.Primary);

  const row = new ActionRowBuilder().addComponents(selectItemButton);

  await channel.send({
    content: `<@${creator.id}> <@${vendorId}>`,
  });

  const itemMsg = await channel.send({ embeds: [buildBuyTicketWelcomeEmbed(creator, vendorId)], components: [row] });
  updateTicket(channel.id, { itemEmbedMessageId: itemMsg.id });

  await interaction.editReply({
    content: `✅ Seu ticket de compra/troca com **${vendorLabel}** foi criado: ${channel}`,
  });
}

// ============================================================
// HANDLER: MODAL
// ============================================================

async function handleItemSelectModal(interaction) {
  const ticket = getTicketWithRecovery(interaction.channel);
  const admin = isAdmin(interaction.guild, interaction.user.id);

  if (!ticket || (!admin && ticket.creatorId !== interaction.user.id)) {
    return interaction.reply({ content: '❌ Apenas o criador do ticket pode selecionar o item.', flags: 64 });
  }

  if (ticket.itemSelected) {
    return interaction.reply({ 
      content: '❌ Você já selecionou um item para este ticket!',
      flags: 64 
    });
  }

  const itemName = interaction.fields.getTextInputValue('item_name').trim();

  if (!itemName) {
    return interaction.reply({ content: '❌ O nome do item não pode estar vazio.', flags: 64 });
  }

  updateTicket(interaction.channel.id, { 
    selectedItem: itemName,
    itemSelected: true 
  });
  
  await interaction.deferUpdate();

  addTicketLog(interaction.channel.id, `Item selecionado: ${itemName} por <@${interaction.user.id}>`);

  const { itemEmbedMessageId } = ticket;

  const cancelButton = new ButtonBuilder()
    .setCustomId('ticket_close_cancelled')
    .setLabel('❌ Cancelado')
    .setStyle(ButtonStyle.Secondary);

  const completeButton = new ButtonBuilder()
    .setCustomId('ticket_close_completed')
    .setLabel('✅ Resolvido')
    .setStyle(ButtonStyle.Success);

  const closeRow = new ActionRowBuilder().addComponents(cancelButton, completeButton);

  if (itemEmbedMessageId) {
    try {
      const msg = await interaction.channel.messages.fetch(itemEmbedMessageId);
      await msg.edit({ embeds: [buildItemSelectionEmbed(itemName, true)], components: [closeRow] });
    } catch {
      await interaction.channel.send({ embeds: [buildItemSelectionEmbed(itemName, true)], components: [closeRow] });
    }
  } else {
    await interaction.channel.send({ embeds: [buildItemSelectionEmbed(itemName, true)], components: [closeRow] });
  }
  
  await interaction.channel.send(`✅ **Item selecionado com sucesso!**\n📦 Item: **${itemName}**\n\nAgora o vendedor pode finalizar o atendimento usando os botões acima.`);
}

// ============================================================
// HANDLER: INTERAÇÕES
// ============================================================

async function handleInteraction(interaction) {
  try {
    // Coleta logs para tickets
    if (interaction.channel && (interaction.channel.topic?.startsWith('compra:') || interaction.channel.topic?.startsWith('venda:'))) {
      const ticket = getTicketWithRecovery(interaction.channel);
      if (ticket && !interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) {
        let logMessage = '';
        if (interaction.isChatInputCommand()) logMessage = `Comando usado: /${interaction.commandName}`;
        else if (interaction.isMessageContextMenuCommand()) logMessage = `Menu de contexto usado`;
        else if (interaction.isUserContextMenuCommand()) logMessage = `Menu de usuário usado`;
        
        if (logMessage) {
          addTicketLog(interaction.channel.id, `${interaction.user.tag} (${interaction.user.id}): ${logMessage}`);
        }
      }
    }

    if (interaction.isChatInputCommand()) {
      await handleCommand(interaction);
      return;
    }

    if (interaction.isButton()) {
      switch (interaction.customId) {
        case 'ticket_buy':           return handleBuyButton(interaction);
        case 'ticket_sell':          return handleSellButton(interaction);
        case 'ticket_close_cancelled': return handleCloseOptions(interaction, 'cancelled');
        case 'ticket_close_completed': return handleCloseOptions(interaction, 'completed');
        case 'ticket_select_item':   return handleSelectItemButton(interaction);
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

// Adiciona listener para mensagens também (logs)
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (message.channel.topic?.startsWith('compra:') || message.channel.topic?.startsWith('venda:')) {
    addTicketLog(message.channel.id, `${message.author.tag} (${message.author.id}): ${message.content.slice(0, 100)}`);
  }
});

// ============================================================
// BOT
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

client.once('ready', async () => {
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

client.on('error', (error) => console.error('[Client Error]', error));
client.on('warn', (info) => console.warn('[Client Warn]', info));

process.on('unhandledRejection', (error) => console.error('[Unhandled Rejection]', error));
process.on('uncaughtException', (error) => console.error('[Uncaught Exception]', error));

client.login(token).catch((err) => {
  console.error('❌ Falha ao logar no Discord:', err.message);
  process.exit(1);
});
