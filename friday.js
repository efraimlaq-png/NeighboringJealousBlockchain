}
const category = guild.channels.cache.get(guildConfig.protocols.meetingCategoryId);
if (!category || category.type !== ChannelType.GuildCategory) {
  return safeReply(interaction, { content: "Categoria de reuniao invalida.", ephemeral: true });
}
const room = await guild.channels.create({
  name: `Reuniao-${Date.now()}`,
  type: ChannelType.GuildVoice,
  parent: category.id,
  permissionOverwrites: [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect] },
    ...guildConfig.protocols.staffRoleIds.map((roleId) => ({
      id: roleId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    })),
  ],
});
const mentions = guildConfig.protocols.staffRoleIds.map((id) => `<@&${id}>`).join(" ");
await interaction.channel.send({
  embeds: [
    new EmbedBuilder()
      .setColor(COLORS.ALERT)
      .setTitle("Protocolo Festa de Arromba")
      .setDescription(`${mentions}\nMotivo: ${reason}\nSala: ${room}`),
  ],
});
for (const roleId of guildConfig.protocols.staffRoleIds) {
  const role = guild.roles.cache.get(roleId);
  if (!role) continue;
  for (const [, m] of role.members) {
    await m
      .send(`Convocacao emergencial em **${guild.name}**.\nMotivo: ${reason}\nSala: ${room.name}`)
      .catch(() => null);
  }
}
return safeReply(interaction, { content: "Convocacao enviada.", ephemeral: true });
}

if (commandName === "protocolo_tabua_rasa") {
const current = interaction.channel;
if (!current) return;
if (current.type === ChannelType.GuildCategory) {
  const originalName = current.name;
  await current.setName(`${originalName}-backup-${Date.now()}`).catch(() => null);
  const newCategory = await guild.channels.create({
    name: originalName,
    type: ChannelType.GuildCategory,
    permissionOverwrites: current.permissionOverwrites.cache.map((ow) => ({
      id: ow.id,
      allow: ow.allow.bitfield,
      deny: ow.deny.bitfield,
    })),
  });
  const children = guild.channels.cache.filter((c) => c.parentId === current.id);
  for (const [, child] of children) {
    await child.clone({ name: child.name, parent: newCategory.id, reason: "Protocolo Tabua Rasa" });
  }
  return safeReply(interaction, {
    content: "Categoria duplicada limpa; backup mantido.",
    ephemeral: true,
  });
}
const originalName = current.name;
await current.setName(`${originalName}-backup-${Date.now()}`).catch(() => null);
await current.clone({ name: originalName, reason: "Protocolo Tabua Rasa" });
return safeReply(interaction, { content: "Canal limpo clonado; backup mantido.", ephemeral: true });
}

if (commandName === "protocolo_edith") {
const targetUser = interaction.options.getUser("usuario", true);
const raw = interaction.options.getString("tempo", true);
const ms = parseDurationToMs(raw);
if (!ms || ms < 60_000) {
  return safeReply(interaction, { content: "Tempo invalido. Ex: 30m, 4h, 2d", ephemeral: true });
}
const target = await guild.members.fetch(targetUser.id).catch(() => null);
if (!target) return safeReply(interaction, { content: "Membro nao encontrado.", ephemeral: true });
const role = await ensureEdithRole(guild, guildConfig);
await target.roles.add(role.id, "Protocolo EDITH").catch(() => null);
const entry = {
  guildId: guild.id,
  userId: target.id,
  ownerId: guild.ownerId,
  roleId: role.id,
  grantedAt: Date.now(),
  expiresAt: Date.now() + ms,
};
state.edithDelegations.push(entry);
writeJson(STATE_FILE, state);
scheduleEdithRemoval(entry);
return safeReply(interaction, {
  embeds: [
    new EmbedBuilder()
      .setColor(COLORS.ALERT)
      .setTitle("Protocolo EDITH")
      .setDescription(`${target} recebeu admin temporario por ${raw}.`),
  ],
  ephemeral: true,
});
}

if (commandName === "limpar") {
const quantity = interaction.options.getInteger("quantidade", true);
const user = interaction.options.getUser("usuario");
const dateRaw = interaction.options.getString("data");

let minDate = null;
if (dateRaw) {
  const ts = new Date(dateRaw).getTime();
  if (Number.isNaN(ts)) {
    return safeReply(interaction, {
      content: "Data invalida. Use AAAA-MM-DD.",
      ephemeral: true,
    });
  }
  minDate = ts;
}

const fetched = await interaction.channel.messages.fetch({ limit: 100 });
let filtered = [...fetched.values()];
if (user) filtered = filtered.filter((m) => m.author.id === user.id);
if (minDate) filtered = filtered.filter((m) => m.createdTimestamp >= minDate);
filtered = filtered.slice(0, quantity);

const under14days = filtered.filter(
  (m) => Date.now() - m.createdTimestamp < 14 * 24 * 60 * 60 * 1000
);
await interaction.channel.bulkDelete(under14days, true);
return safeReply(interaction, {
  content: `Limpeza concluida: ${under14days.length} mensagens removidas.`,
  ephemeral: true,
});
}

if (commandName === "remove_roles") {
const user = interaction.options.getUser("usuario", true);
const member = await guild.members.fetch(user.id).catch(() => null);
if (!member) {
  return safeReply(interaction, { content: "Membro nao encontrado.", ephemeral: true });
}
const rolesToRemove = member.roles.cache.filter((r) => r.id !== guild.roles.everyone.id);
await member.roles.remove(rolesToRemove, "Reestruturacao");
return safeReply(interaction, { content: `Todos os cargos removidos de ${member}.`, ephemeral: true });
}
} catch (error) {
console.error("[INTERACTION] Erro:", error);
if (interaction.isRepliable()) {
await safeReply(interaction, {
  content: "Ocorreu um erro ao processar a interacao.",
  ephemeral: true,
}).catch(() => null);
}
}
});

client.on("messageCreate", async (message) => {
if (!message.guild || message.author.bot || !message.channel.isThread()) return;
const map = state.anonymousThreads[message.channel.id];
if (!map) return;
if (message.author.id === client.user.id) return;
const member = await message.guild.members.fetch(message.author.id).catch(() => null);
if (!member) return;
const isStaff = member.permissions.has(PermissionFlagsBits.ManageMessages);
if (!isStaff) return;
const user = await client.users.fetch(map.userId).catch(() => null);
if (!user) return;
const text = message.content?.trim();
if (!text) return;
await user
.send(`Resposta da diretoria (${message.guild.name}) sobre seu relato anonimo:\n${text}`)
.catch(() => null);
});

if (!process.env.DISCORD_TOKEN) {
console.error("Defina DISCORD_TOKEN no .env. Opcional: GUILD_ID para registro rapido.");
process.exit(1);
}

client.login(process.env.DISCORD_TOKEN);