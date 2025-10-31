/**
 * Test bots actually playing
 */
import { CatanNet } from './models/catanNet';
import { AIPlayer } from './bot/aiPlayer';
import { exec } from 'child_process';

async function test() {
  console.log('=== Testing Bot Gameplay ===\n');

  const network = new CatanNet();
  network.build(128, 2);

  // Create 4 bots
  const bots: AIPlayer[] = [];
  for (let i = 0; i < 4; i++) {
    const bot = new AIPlayer(network, `Bot${i}`);
    await bot.waitForConnection();
    bots.push(bot);
  }

  // Create and join game
  const { gameId, password } = await bots[0].createGame();
  console.log(`Game created: ${gameId}\n`);

  // Open browser to spectate
  const spectateUrl = `http://localhost:3000/?spectate=${gameId}`;
  console.log(`Opening browser: ${spectateUrl}\n`);

  // Try different commands based on platform
  const platform = process.platform;
  let command: string;
  if (platform === 'darwin') {
    command = `open "${spectateUrl}"`;
  } else if (platform === 'win32') {
    command = `start "${spectateUrl}"`;
  } else {
    // Linux
    command = `xdg-open "${spectateUrl}" || firefox "${spectateUrl}" || google-chrome "${spectateUrl}"`;
  }

  exec(command, (error) => {
    if (error) {
      console.log(`Note: Could not auto-open browser. Please visit: ${spectateUrl}`);
    }
  });

  for (let i = 1; i < 4; i++) {
    await bots[i].joinGame(gameId, password);
    await new Promise(r => setTimeout(r, 300));
  }

  console.log('All bots joined\n');

  // Start game
  await new Promise(r => setTimeout(r, 1000));
  bots[0].startGame();
  console.log('Game started\n');

  // Wait and watch
  console.log('Watching for 30 seconds...\n');
  await new Promise(r => setTimeout(r, 30000));

  // Cleanup
  bots.forEach(b => b.disconnect());
  process.exit(0);
}

test().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
