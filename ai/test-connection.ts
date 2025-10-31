/**
 * Test bot connection and game creation
 */
import { CatanNet } from './models/catanNet';
import { AIPlayer } from './bot/aiPlayer';

async function test() {
  console.log('=== Testing Bot Connection ===\n');

  // Build small network
  const network = new CatanNet();
  network.build(128, 2);

  // Create first bot
  console.log('Creating bot 1...');
  const bot1 = new AIPlayer(network, 'TestBot1');
  await bot1.waitForConnection();
  console.log('Bot 1 connected!');

  // Create game
  console.log('\nCreating game...');
  const { gameId, password } = await bot1.createGame();
  console.log(`Game created: ${gameId}`);
  console.log(`Password: ${password}`);

  // Create more bots and join
  console.log('\nCreating bot 2...');
  const bot2 = new AIPlayer(network, 'TestBot2');
  await bot2.waitForConnection();
  await bot2.joinGame(gameId, password);
  console.log('Bot 2 joined!');

  console.log('\nCreating bot 3...');
  const bot3 = new AIPlayer(network, 'TestBot3');
  await bot3.waitForConnection();
  await bot3.joinGame(gameId, password);
  console.log('Bot 3 joined!');

  console.log('\nCreating bot 4...');
  const bot4 = new AIPlayer(network, 'TestBot4');
  await bot4.waitForConnection();
  await bot4.joinGame(gameId, password);
  console.log('Bot 4 joined!');

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Start game
  console.log('\nStarting game...');
  bot1.startGame();

  console.log('\nWaiting for game to start...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Disconnect all
  console.log('\nDisconnecting bots...');
  bot1.disconnect();
  bot2.disconnect();
  bot3.disconnect();
  bot4.disconnect();

  console.log('\n=== Test Complete! ===\n');
  process.exit(0);
}

test().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
