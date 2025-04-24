const { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } = require("@whiskeysockets/baileys");
const pino = require("pino");
const chalk = require("chalk");
const readline = require("readline");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const { createCanvas, loadImage } = require("canvas");

// CONFIGURATION
const CONFIG = {
  usePairingCode: true,
  pokeapi: "https://pokeapi.co/api/v2",
  dataFiles: {
    trainers: "./data/trainers.json",
    gyms: "./data/gyms.json",
    items: "./data/items.json"
  },
  starterPokemon: ["bulbasaur", "charmander", "squirtle"],
  maxTeamSize: 6,
  imageTempDir: "./temp"
};

// Initialize data storage and temp directory
function initData() {
  if (!fs.existsSync("./data")) fs.mkdirSync("./data");
  if (!fs.existsSync(CONFIG.imageTempDir)) fs.mkdirSync(CONFIG.imageTempDir);
  
  const defaults = {
    trainers: {},
    gyms: {
      "Pewter City": { leader: "Brock", type: "rock", defeated: false, team: [] },
      "Cerulean City": { leader: "Misty", type: "water", defeated: false, team: [] },
      "Vermilion City": { leader: "Lt. Surge", type: "electric", defeated: false, team: [] },
      "Celadon City": { leader: "Erika", type: "grass", defeated: false, team: [] }
    },
    items: {
      pokeball: { type: "catch", quantity: 5 },
      potion: { type: "heal", healAmount: 20, quantity: 3 }
    }
  };

  Object.entries(CONFIG.dataFiles).forEach(([key, path]) => {
    if (!fs.existsSync(path)) {
      fs.writeFileSync(path, JSON.stringify(defaults[key], null, 2));
    }
  });
}

initData();

// Helper functions
const question = (text) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(text, resolve));
};

const getData = (type) => JSON.parse(fs.readFileSync(CONFIG.dataFiles[type]));
const saveData = (type, data) => fs.writeFileSync(CONFIG.dataFiles[type], JSON.stringify(data, null, 2));

// Image Generation System
class ImageGenerator {
  static async generateBattleScene(attacker, defender, move, damage) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    // Load images
    const [attackerImg, defenderImg, bgImg] = await Promise.all([
      loadImage(attacker.image).catch(() => loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png')),
      loadImage(defender.image).catch(() => loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png')),
      loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/25.png').catch(() => null)
    ]);

    // Draw background
    ctx.fillStyle = this.getTypeColor(attacker.types[0]);
    ctx.fillRect(0, 0, canvas.width/2, canvas.height);
    ctx.fillStyle = this.getTypeColor(defender.types[0]);
    ctx.fillRect(canvas.width/2, 0, canvas.width/2, canvas.height);

    // Draw Pokémon
    ctx.drawImage(attackerImg, 50, 150, 250, 250);
    ctx.drawImage(defenderImg, 500, 150, 250, 250);

    // Draw HP bars
    this.drawHPBar(ctx, attacker, 50, 100, 300);
    this.drawHPBar(ctx, defender, 450, 100, 300);

    // Draw attack effect
    ctx.fillStyle = this.getMoveColor(move);
    ctx.beginPath();
    ctx.arc(600, 250, 30 + damage/3, 0, Math.PI * 2);
    ctx.fill();

    // Add text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 24px Arial';
    ctx.fillText(`${attacker.name.toUpperCase()}`, 50, 50);
    ctx.fillText(`${defender.name.toUpperCase()}`, 450, 50);
    
    ctx.font = '20px Arial';
    ctx.fillText(`Lv. ${attacker.level}`, 50, 80);
    ctx.fillText(`Lv. ${defender.level}`, 450, 80);

    ctx.font = 'bold 28px Arial';
    ctx.fillText(`${attacker.name} used ${move.toUpperCase()}!`, 50, 350);
    ctx.fillText(`-${damage} HP!`, 600, 350);

    // Save to file
    const filename = path.join(CONFIG.imageTempDir, `battle_${Date.now()}.png`);
    const buffer = canvas.toBuffer();
    fs.writeFileSync(filename, buffer);
    return filename;
  }

  static async generateCaptureScene(pokemon, success) {
    const canvas = createCanvas(600, 400);
    const ctx = canvas.getContext('2d');

    // Draw background
    ctx.fillStyle = success ? '#27ae60' : '#e74c3c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Pokémon
    const pokemonImg = await loadImage(pokemon.image).catch(() => 
      loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'));
    ctx.drawImage(pokemonImg, 150, 50, 300, 300);

    // Draw Pokéball
    const ballImg = await loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/items/poke-ball.png');
    ctx.drawImage(ballImg, 250, 300, 100, 100);

    // Add sparkle effect if successful
    if (success) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
      for (let i = 0; i < 5; i++) {
        ctx.beginPath();
        ctx.arc(
          100 + Math.random() * 400,
          100 + Math.random() * 200,
          5 + Math.random() * 10,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    // Add text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 36px Arial';
    ctx.fillText(
      success ? 'GOTCHA!' : 'OH NO!', 
      200, 
      380
    );
    ctx.font = '24px Arial';
    ctx.fillText(
      success ? `${pokemon.name.toUpperCase()} was caught!` : `${pokemon.name.toUpperCase()} broke free!`,
      150,
      420
    );

    const filename = path.join(CONFIG.imageTempDir, `capture_${Date.now()}.png`);
    fs.writeFileSync(filename, canvas.toBuffer());
    return filename;
  }

  static async generateEvolutionScene(before, after) {
    const canvas = createCanvas(800, 400);
    const ctx = canvas.getContext('2d');

    // Load images
    const [beforeImg, afterImg] = await Promise.all([
      loadImage(before.image).catch(() => loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png')),
      loadImage(after.image).catch(() => loadImage('https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/0.png'))
    ]);

    // Draw background
    const gradient = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    gradient.addColorStop(0, '#8e44ad');
    gradient.addColorStop(1, '#3498db');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw Pokémon
    ctx.drawImage(beforeImg, 100, 100, 250, 250);
    ctx.drawImage(afterImg, 450, 100, 250, 250);

    // Add evolution arrow
    ctx.fillStyle = 'white';
    ctx.font = 'bold 72px Arial';
    ctx.fillText('➔', 350, 250);

    // Add text
    ctx.font = 'bold 36px Arial';
    ctx.fillText('EVOLUTION', 300, 50);
    ctx.font = '28px Arial';
    ctx.fillText(`${before.name.toUpperCase()}`, 150, 380);
    ctx.fillText(`${after.name.toUpperCase()}`, 500, 380);

    const filename = path.join(CONFIG.imageTempDir, `evolve_${Date.now()}.png`);
    fs.writeFileSync(filename, canvas.toBuffer());
    return filename;
  }

  static drawHPBar(ctx, pokemon, x, y, width) {
    const hpPercent = pokemon.stats.hp / pokemon.stats.maxHp;
    
    // Background
    ctx.fillStyle = '#333';
    ctx.fillRect(x, y, width, 20);
    
    // HP bar
    ctx.fillStyle = hpPercent > 0.5 ? '#2ecc71' : hpPercent > 0.2 ? '#f39c12' : '#e74c3c';
    ctx.fillRect(x, y, width * hpPercent, 20);
    
    // Border
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, 20);
    
    // Text
    ctx.fillStyle = 'white';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`${pokemon.stats.hp}/${pokemon.stats.maxHp}`, x + 5, y + 15);
  }

  static getTypeColor(type) {
    const colors = {
      normal: '#A8A878',
      fire: '#F08030',
      water: '#6890F0',
      electric: '#F8D030',
      grass: '#78C850',
      ice: '#98D8D8',
      fighting: '#C03028',
      poison: '#A040A0',
      ground: '#E0C068',
      flying: '#A890F0',
      psychic: '#F85888',
      bug: '#A8B820',
      rock: '#B8A038',
      ghost: '#705898',
      dragon: '#7038F8',
      dark: '#705848',
      steel: '#B8B8D0',
      fairy: '#EE99AC'
    };
    return colors[type] || '#68A090';
  }

  static getMoveColor(move) {
    // This would ideally come from move data, simplified here
    const moveTypes = {
      thunderbolt: '#F8D030',
      flamethrower: '#F08030',
      hydropump: '#6890F0',
      tackle: '#A8A878'
    };
    return moveTypes[move] || '#FFFFFF';
  }
}

// Pokémon System
class PokemonSystem {
  static async fetchPokemon(nameOrId) {
    try {
      const { data } = await axios.get(`${CONFIG.pokeapi}/pokemon/${nameOrId}`);
      const species = await axios.get(`${CONFIG.pokeapi}/pokemon-species/${data.id}`);
      
      return {
        id: data.id,
        name: data.name,
        level: 5,
        stats: {
          hp: data.stats[0].base_stat,
          maxHp: data.stats[0].base_stat,
          attack: data.stats[1].base_stat,
          defense: data.stats[2].base_stat,
          speed: data.stats[5].base_stat
        },
        types: data.types.map(t => t.type.name),
        moves: data.moves.slice(0, 4).map(m => m.move.name),
        evolution: species.data.evolves_from_species?.name || null,
        image: data.sprites.other["official-artwork"].front_default || 
               `https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork/${data.id}.png`
      };
    } catch {
      return null;
    }
  }

  static async generateGymTeam(type, count=3) {
    const { data } = await axios.get(`${CONFIG.pokeapi}/type/${type}`);
    const pokemonPool = data.pokemon.map(p => p.pokemon.name);
    const team = [];
    
    for (let i = 0; i < count; i++) {
      const randomPokemon = pokemonPool[Math.floor(Math.random() * pokemonPool.length)];
      const pokemon = await this.fetchPokemon(randomPokemon);
      pokemon.level = 15 + Math.floor(Math.random() * 10); // Gym Pokémon are stronger
      team.push(pokemon);
    }
    
    return team;
  }

  static calculateDamage(attacker, defender, move) {
    // Simplified damage calculation
    const basePower = 50; // Would normally come from move data
    const attack = attacker.stats.attack;
    const defense = defender.stats.defense;
    const levelFactor = (2 * attacker.level) / 5 + 2;
    const damage = Math.floor((levelFactor * basePower * attack / defense) / 50) + 2;
    return Math.max(1, damage);
  }

  static canEvolve(pokemon) {
    return pokemon.evolution && pokemon.level >= 30;
  }

  static async evolvePokemon(pokemon) {
    if (!this.canEvolve(pokemon)) return null;
    const evolved = await this.fetchPokemon(pokemon.evolution);
    evolved.level = pokemon.level; // Keep the same level
    return evolved;
  }
}

// Battle System
class BattleSystem {
  constructor(player1, player2) {
    this.players = { 
      player1: { ...player1, activePokemon: player1.team[0] },
      player2: { ...player2, activePokemon: player2.team[0] }
    };
    this.currentTurn = Math.random() < 0.5 ? 'player1' : 'player2';
    this.battleLog = [];
  }

  async executeTurn(action) {
    const attacker = this.players[this.currentTurn];
    const defender = this.players[this.currentTurn === 'player1' ? 'player2' : 'player1'];
    
    let result = { status: 'continue' };
    
    if (action.type === 'attack') {
      const damage = PokemonSystem.calculateDamage(attacker.activePokemon, defender.activePokemon, action.move);
      defender.activePokemon.stats.hp = Math.max(0, defender.activePokemon.stats.hp - damage);
      
      this.battleLog.push(
        `${attacker.name}'s ${attacker.activePokemon.name} used ${action.move}!`,
        `It dealt ${damage} damage to ${defender.name}'s ${defender.activePokemon.name}!`
      );

      if (defender.activePokemon.stats.hp <= 0) {
        this.battleLog.push(`${defender.name}'s ${defender.activePokemon.name} fainted!`);
        result = { status: 'knockout', damage };
      } else {
        result = { status: 'continue', damage };
      }
    } else if (action.type === 'switch') {
      // Handle Pokémon switching
    } else if (action.type === 'item') {
      // Handle item usage
    }
    
    // Switch turn if battle continues
    if (result.status === 'continue') {
      this.currentTurn = this.currentTurn === 'player1' ? 'player2' : 'player1';
    }
    
    return result;
  }

  checkBattleEnd() {
    const player1Lost = this.players.player1.team.every(p => p.stats.hp <= 0);
    const player2Lost = this.players.player2.team.every(p => p.stats.hp <= 0);
    
    if (player1Lost) return this.players.player2;
    if (player2Lost) return this.players.player1;
    return null;
  }

  getBattleStatus() {
    const attacker = this.players[this.currentTurn];
    const defender = this.players[this.currentTurn === 'player1' ? 'player2' : 'player1'];
    
    let status = `*${attacker.name}'s Turn*\n`;
    status += `Active: ${attacker.activePokemon.name} (Lv. ${attacker.activePokemon.level}) - HP: ${attacker.activePokemon.stats.hp}/${attacker.activePokemon.stats.maxHp}\n\n`;
    status += `*Available Moves:*\n${attacker.activePokemon.moves.join(', ')}\n\n`;
    status += `*Opponent:* ${defender.activePokemon.name} - HP: ${defender.activePokemon.stats.hp}/${defender.activePokemon.stats.maxHp}`;
    
    return status;
  }
}

// WhatsApp Bot
async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState("./session");
  const bot = makeWASocket({
    auth: state,
    printQRInTerminal: !CONFIG.usePairingCode,
    logger: pino({ level: "silent" })
  });

  // Active battles storage
  const activeBattles = {};

  // 6-Digit Pairing
  if (CONFIG.usePairingCode && !bot.authState.creds.registered) {
    const phoneNumber = await question("Enter your WhatsApp number (e.g., 2349076119745): ");
    const code = await bot.requestPairingCode(phoneNumber.trim());
    console.log(`Pairing code: ${code}`);
  }

  // Event Handlers
  bot.ev.on("connection.update", (update) => {
    if (update.connection === "open") {
      console.log(chalk.green("Bot connected to WhatsApp!"));
      bot.sendMessage("1234567890@s.whatsapp.net", { 
        text: "Pokémon Bot is now online! Use !help to see commands." 
      }).catch(console.error);
    }
  });

  bot.ev.on("messages.upsert", async ({ messages }) => {
    const m = messages[0];
    if (!m.message || m.key.remoteJid === "status@broadcast") return;

    const text = m.message.conversation?.toLowerCase() || "";
    const sender = m.key.remoteJid;
    const [cmd, ...args] = text.split(" ");

    try {
      if (activeBattles[sender]) {
        await handleBattleAction(bot, sender, text, activeBattles[sender]);
        return;
      }

      switch(cmd) {
        case "!start": await handleStart(bot, sender); break;
        case "!pokemon": await handlePokemonInfo(bot, sender, args); break;
        case "!catch": await handleCatch(bot, sender, args); break;
        case "!team": await handleTeam(bot, sender); break;
        case "!gym": await handleGym(bot, sender, args); break;
        case "!item": await handleItem(bot, sender, args); break;
        case "!evolve": await handleEvolve(bot, sender, args); break;
        case "!battle": await handleBattleChallenge(bot, sender, args); break;
        case "!help": await handleHelp(bot, sender); break;
        default: await bot.sendMessage(sender, { text: "Unknown command. Try !help" });
      }
    } catch (e) {
      console.error(e);
      await bot.sendMessage(sender, { text: "An error occurred. Please try again." });
    }
  });

  // Command Handlers
  async function handleStart(bot, sender) {
    const trainers = getData("trainers");
    if (trainers[sender]) {
      await bot.sendMessage(sender, { text: "You've already started your Pokémon journey!" });
      return;
    }

    trainers[sender] = {
      name: "Trainer",
      team: [],
      badges: [],
      items: { pokeball: 5, potion: 3 },
      starter: null
    };
    saveData("trainers", trainers);

    await bot.sendMessage(sender, {
      text: "Welcome to the world of Pokémon!\n\n" +
        "Choose your starter Pokémon with:\n" +
        "!catch bulbasaur\n" +
        "!catch charmander\n" +
        "!catch squirtle\n\n" +
        "Or catch any Pokémon you encounter!"
    });
  }

  async function handlePokemonInfo(bot, sender, args) {
    if (!args[0]) {
      await bot.sendMessage(sender, { text: "Usage: !pokemon <name> (e.g., !pokemon pikachu)" });
      return;
    }

    const pokemon = await PokemonSystem.fetchPokemon(args[0]);
    if (!pokemon) {
      await bot.sendMessage(sender, { text: "Pokémon not found! Try another name." });
      return;
    }

    await bot.sendMessage(sender, {
      image: { url: pokemon.image },
      caption: `*${pokemon.name.toUpperCase()}*\n` +
        `Type: ${pokemon.types.join(", ")}\n` +
        `Level: ${pokemon.level}\n` +
        `HP: ${pokemon.stats.hp}\n` +
        `Attack: ${pokemon.stats.attack}\n` +
        `Defense: ${pokemon.stats.defense}\n` +
        `Speed: ${pokemon.stats.speed}\n` +
        `Moves: ${pokemon.moves.join(", ")}\n` +
        (pokemon.evolution ? `Evolves from: ${pokemon.evolution}` : "")
    });
  }

  async function handleCatch(bot, sender, args) {
    if (!args[0]) {
      await bot.sendMessage(sender, { text: "Usage: !catch <pokemon> (e.g., !catch pikachu)" });
      return;
    }

    const trainers = getData("trainers");
    if (!trainers[sender]) {
      await bot.sendMessage(sender, { text: "Please start your journey with !start first" });
      return;
    }

    // Check if player has pokeballs
    if (trainers[sender].items.pokeball <= 0) {
      await bot.sendMessage(sender, { text: "You're out of Poké Balls! Buy more with !item buy pokeball" });
      return;
    }

    const pokemon = await PokemonSystem.fetchPokemon(args[0]);
    if (!pokemon) {
      await bot.sendMessage(sender, { text: "Invalid Pokémon name!" });
      return;
    }

    // Use a pokeball
    trainers[sender].items.pokeball--;
    saveData("trainers", trainers);

    // 50% base catch rate, higher for lower level Pokémon
    const catchRate = 0.5 + (5 / pokemon.level) * 0.1;
    const success = Math.random() < catchRate;

    // Generate capture image
    const captureImg = await ImageGenerator.generateCaptureScene(pokemon, success);
    
    if (success) {
      // Add to team if space available
      if (trainers[sender].team.length < CONFIG.maxTeamSize) {
        trainers[sender].team.push(pokemon);
        saveData("trainers", trainers);
        await bot.sendMessage(sender, {
          image: { url: captureImg },
          caption: `You caught ${pokemon.name.toUpperCase()}! It's been added to your team.`
        });
      } else {
        await bot.sendMessage(sender, {
          image: { url: captureImg },
          caption: `You caught ${pokemon.name.toUpperCase()}! But your team is full. Use !team to manage your Pokémon.`
        });
      }
    } else {
      await bot.sendMessage(sender, {
        image: { url: captureImg },
        caption: `Oh no! ${pokemon.name.toUpperCase()} broke free!`
      });
    }
  }

  async function handleTeam(bot, sender) {
    const trainers = getData("trainers");
    if (!trainers[sender]?.team.length) {
      await bot.sendMessage(sender, { text: "Your team is empty! Use !catch to add Pokémon." });
      return;
    }

    let teamInfo = "*YOUR POKÉMON TEAM*\n\n";
    trainers[sender].team.forEach((p, i) => {
      teamInfo += `${i+1}. ${p.name.toUpperCase()} (Lv. ${p.level}) - HP: ${p.stats.hp}/${p.stats.maxHp}\n`;
    });

    await bot.sendMessage(sender, { text: teamInfo });
  }

  async function handleGym(bot, sender, args) {
    const gyms = getData("gyms");
    const trainers = getData("trainers");
    
    if (!args[0]) {
      let gymList = "*AVAILABLE GYMS*\n\n";
      Object.entries(gyms).forEach(([name, gym]) => {
        const badgeStatus = trainers[sender]?.badges.includes(name) ? "✓" : "✗";
        gymList += `${badgeStatus} ${name} - Leader: ${gym.leader} (${gym.type} type)\n`;
      });
      
      await bot.sendMessage(sender, { 
        text: gymList + "\nChallenge a gym with: !gym <name>"
      });
      return;
    }

    const gymName = args.join(" ");
    if (!gyms[gymName]) {
      await bot.sendMessage(sender, { text: "Gym not found! Use !gym to see available gyms." });
      return;
    }

    if (trainers[sender]?.badges.includes(gymName)) {
      await bot.sendMessage(sender, { text: `You've already defeated ${gymName}'s ${gyms[gymName].leader}!` });
      return;
    }

    // Check if player has Pokémon
    const playerTeam = trainers[sender]?.team.filter(p => p.stats.hp > 0);
    if (!playerTeam?.length) {
      await bot.sendMessage(sender, { text: "All your Pokémon are fainted! Heal them with potions first." });
      return;
    }

    // Initialize gym team if needed
    if (gyms[gymName].team.length === 0) {
      gyms[gymName].team = await PokemonSystem.generateGymTeam(gyms[gymName].type);
      saveData("gyms", gyms);
    }

    // Start battle
    activeBattles[sender] = new BattleSystem(
      { 
        name: trainers[sender].name, 
        team: playerTeam, 
        activePokemon: playerTeam[0] 
      },
      { 
        name: gyms[gymName].leader, 
        team: gyms[gymName].team, 
        activePokemon: gyms[gymName].team[0] 
      }
    );

    const battleImg = await ImageGenerator.generateBattleScene(
      playerTeam[0],
      gyms[gymName].team[0],
      "start",
      0
    );

    await bot.sendMessage(sender, {
      image: { url: battleImg },
      caption: `Gym Battle against ${gyms[gymName].leader}!\n\n` +
        `Your ${playerTeam[0].name} (Lv. ${playerTeam[0].level}) vs ` +
        `${gyms[gymName].team[0].name} (Lv. ${gyms[gymName].team[0].level})\n\n` +
        "Available commands:\n" +
        "!attack <move>\n" +
        "!switch <pokemon number>\n" +
        "!use potion"
    });
  }

  async function handleItem(bot, sender, args) {
    const trainers = getData("trainers");
    if (!trainers[sender]) {
      await bot.sendMessage(sender, { text: "Please start your journey with !start first" });
      return;
    }

    if (!args[0]) {
      let itemList = "*YOUR ITEMS*\n\n";
      Object.entries(trainers[sender].items).forEach(([item, quantity]) => {
        itemList += `${item}: ${quantity}\n`;
      });
      
      await bot.sendMessage(sender, { 
        text: itemList + "\nUse items with: !item use <item>"
      });
      return;
    }

    const [action, item] = args;
    if (action === "use") {
      if (item === "potion") {
        if (trainers[sender].items.potion <= 0) {
          await bot.sendMessage(sender, { text: "You're out of potions!" });
          return;
        }

        // Heal first Pokémon in team
        if (trainers[sender].team.length === 0) {
          await bot.sendMessage(sender, { text: "You don't have any Pokémon to heal!" });
          return;
        }

        const pokemon = trainers[sender].team[0];
        const healAmount = 20; // From CONFIG
        pokemon.stats.hp = Math.min(pokemon.stats.maxHp, pokemon.stats.hp + healAmount);
        
        trainers[sender].items.potion--;
        saveData("trainers", trainers);

        await bot.sendMessage(sender, {
          text: `Used Potion on ${pokemon.name}! It recovered ${healAmount} HP.\n` +
                `Current HP: ${pokemon.stats.hp}/${pokemon.stats.maxHp}`
        });
      } else {
        await bot.sendMessage(sender, { text: "Unknown item. Use !item to see your inventory." });
      }
    } else {
      await bot.sendMessage(sender, { text: "Usage: !item use <item>" });
    }
  }

  async function handleEvolve(bot, sender, args) {
    if (!args[0]) {
      await bot.sendMessage(sender, { text: "Usage: !evolve <pokemon number> (from your !team)" });
      return;
    }

    const pokemonIndex = parseInt(args[0]) - 1;
    const trainers = getData("trainers");
    
    if (!trainers[sender] || pokemonIndex < 0 || pokemonIndex >= trainers[sender].team.length) {
      await bot.sendMessage(sender, { text: "Invalid Pokémon number! Use !team to check your Pokémon." });
      return;
    }

    const pokemon = trainers[sender].team[pokemonIndex];
    if (!PokemonSystem.canEvolve(pokemon)) {
      await bot.sendMessage(sender, { text: `${pokemon.name} can't evolve right now! (Needs level 30+)` });
      return;
    }

    const evolvedForm = await PokemonSystem.evolvePokemon(pokemon);
    if (!evolvedForm) {
      await bot.sendMessage(sender, { text: "Evolution failed!" });
      return;
    }

    // Generate evolution image
    const evolveImg = await ImageGenerator.generateEvolutionScene(pokemon, evolvedForm);
    
    // Replace Pokémon in team
    trainers[sender].team[pokemonIndex] = evolvedForm;
    saveData("trainers", trainers);

    await bot.sendMessage(sender, {
      image: { url: evolveImg },
      caption: `Congratulations! ${pokemon.name.toUpperCase()} evolved into ${evolvedForm.name.toUpperCase()}!`
    });
  }

  async function handleBattleChallenge(bot, sender, args) {
    await bot.sendMessage(sender, { 
      text: "Player vs Player battles coming soon! For now, challenge gyms with !gym" 
    });
  }

  async function handleHelp(bot, sender) {
    await bot.sendMessage(sender, {
      text: "*POKÉMON BOT COMMANDS*\n\n" +
        "!start - Begin your journey\n" +
        "!catch <pokemon> - Attempt to catch a Pokémon\n" +
        "!team - View your current team\n" +
        "!pokemon <name> - Get info about a Pokémon\n" +
        "!gym - List/challenge gyms\n" +
        "!item - Use/view your items\n" +
        "!evolve <number> - Evolve a Pokémon\n" +
        "!help - Show this menu"
    });
  }

  async function handleBattleAction(bot, sender, text, battle) {
    const [cmd, ...args] = text.split(" ");
    let action = { type: "unknown" };

    if (cmd === "!attack" && args[0]) {
      action = { type: "attack", move: args[0] };
    } else if (cmd === "!switch" && args[0]) {
      // Handle switching (simplified for example)
      await bot.sendMessage(sender, { text: "Switching Pokémon coming in next update!" });
      return;
    } else if (cmd === "!use" && args[0] === "potion") {
      // Handle item usage (simplified for example)
      await bot.sendMessage(sender, { text: "Using items in battle coming in next update!" });
      return;
    } else {
      await bot.sendMessage(sender, { text: "In battle commands: !attack <move>, !switch <number>, !use potion" });
      return;
    }

    const result = await battle.executeTurn(action);
    
    // Generate battle image
    const battleImg = await ImageGenerator.generateBattleScene(
      battle.players[battle.currentTurn === 'player1' ? 'player1' : 'player2'].activePokemon,
      battle.players[battle.currentTurn === 'player1' ? 'player2' : 'player1'].activePokemon,
      action.move,
      result.damage || 0
    );

    // Send update
    await bot.sendMessage(sender, {
      image: { url: battleImg },
      caption: battle.battleLog.slice(-2).join("\n\n")
    });

    // Check for battle end
    if (result.status === 'knockout') {
      const winner = battle.checkBattleEnd();
      if (winner) {
        await handleBattleEnd(bot, sender, battle, winner);
        delete activeBattles[sender];
      }
    }
  }

  async function handleBattleEnd(bot, sender, battle, winner) {
    const trainers = getData("trainers");
    const gyms = getData("gyms");
    
    // Check if this was a gym battle
    const isGymBattle = Object.values(gyms).some(gym => gym.leader === winner.name);
    
    if (isGymBattle && winner.name === trainers[sender].name) {
      const gym = Object.values(gyms).find(g => g.leader === battle.players.player2.name);
      gym.defeated = true;
      trainers[sender].badges.push(gym.name);
      saveData("gyms", gyms);
      saveData("trainers", trainers);
      
      await bot.sendMessage(sender, {
        text: `🏆 You defeated ${gym.leader} and earned the ${gym.name} Badge! 🏆`
      });
    } else if (winner.name === trainers[sender].name) {
      await bot.sendMessage(sender, {
        text: `You won the battle! Your Pokémon gained experience!`
      });
    } else {
      await bot.sendMessage(sender, {
        text: `You lost the battle... Heal your Pokémon and try again!`
      });
    }
  }

  // System
  bot.ev.on("creds.update", saveCreds);
  console.log(chalk.green.bold("Pokémon Bot successfully started!"));
}

// Start the bot
startBot().catch(err => {
  console.error(chalk.red("Bot crashed:"), err);
  process.exit(1);
});