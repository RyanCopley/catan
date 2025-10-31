import { z } from 'zod';

// Coordinate schema
const coordinateSchema = z.object({
  x: z.number().finite(),
  y: z.number().finite()
});

// Edge schema (for input - only needs coordinates)
const edgeInputSchema = z.object({
  v1: coordinateSchema,
  v2: coordinateSchema
});

// Hex coordinate schema
const hexCoordinateSchema = z.object({
  q: z.number().int(),
  r: z.number().int()
});

// Resource schema
const resourcesSchema = z.object({
  wood: z.number().int().min(0).optional(),
  brick: z.number().int().min(0).optional(),
  sheep: z.number().int().min(0).optional(),
  wheat: z.number().int().min(0).optional(),
  ore: z.number().int().min(0).optional()
});

// Resource type schema
const resourceTypeSchema = z.enum(['wood', 'brick', 'sheep', 'wheat', 'ore']);

// Game ID schema (6 uppercase alphanumeric characters)
const gameIdSchema = z.string().regex(/^[A-Z0-9]{6}$/, 'Game ID must be 6 uppercase alphanumeric characters');

// Player name schema
const playerNameSchema = z.string().min(1).max(20).trim();

// Password schema
const passwordSchema = z.string().min(1).max(100);

// Socket event schemas
export const schemas = {
  createGame: z.object({
    playerName: playerNameSchema,
    password: passwordSchema
  }),

  joinGame: z.object({
    gameId: gameIdSchema,
    playerName: playerNameSchema,
    password: passwordSchema
  }),

  spectateGame: z.object({
    gameId: gameIdSchema
  }),

  toggleReady: z.object({
    gameId: gameIdSchema
  }),

  startGame: z.object({
    gameId: gameIdSchema
  }),

  leaveGame: z.object({
    gameId: gameIdSchema
  }),

  rollDice: z.object({
    gameId: gameIdSchema
  }),

  buildSettlement: z.object({
    gameId: gameIdSchema,
    vertex: coordinateSchema
  }),

  buildRoad: z.object({
    gameId: gameIdSchema,
    edge: edgeInputSchema
  }),

  buildCity: z.object({
    gameId: gameIdSchema,
    vertex: coordinateSchema
  }),

  endTurn: z.object({
    gameId: gameIdSchema
  }),

  tradeOffer: z.object({
    gameId: gameIdSchema,
    targetPlayerId: z.string().nullable(),
    offering: resourcesSchema,
    requesting: resourcesSchema
  }),

  tradeRespond: z.object({
    gameId: gameIdSchema,
    offerId: z.number().int().positive(),
    response: z.enum(['accepted', 'rejected'])
  }),

  tradeConfirm: z.object({
    gameId: gameIdSchema,
    offerId: z.number().int().positive(),
    acceptingPlayerId: z.string()
  }),

  tradeCancel: z.object({
    gameId: gameIdSchema,
    offerId: z.number().int().positive()
  }),

  bankTrade: z.object({
    gameId: gameIdSchema,
    givingResource: resourceTypeSchema,
    receivingResource: resourceTypeSchema,
    amount: z.number().int().positive().optional()
  }),

  discardCards: z.object({
    gameId: gameIdSchema,
    cardsToDiscard: resourcesSchema
  }),

  moveRobber: z.object({
    gameId: gameIdSchema,
    hexCoords: hexCoordinateSchema
  }),

  stealCard: z.object({
    gameId: gameIdSchema,
    targetPlayerId: z.string().nullable()
  }),

  buyDevelopmentCard: z.object({
    gameId: gameIdSchema
  }),

  playKnight: z.object({
    gameId: gameIdSchema,
    hexCoords: hexCoordinateSchema
  }),

  playYearOfPlenty: z.object({
    gameId: gameIdSchema,
    resource1: resourceTypeSchema,
    resource2: resourceTypeSchema
  }),

  playMonopoly: z.object({
    gameId: gameIdSchema,
    resource: resourceTypeSchema
  }),

  playRoadBuilding: z.object({
    gameId: gameIdSchema
  }),

  buildRoadFree: z.object({
    gameId: gameIdSchema,
    edge: edgeInputSchema
  }),

  chatMessage: z.object({
    gameId: gameIdSchema,
    message: z.string().min(1).max(200).trim()
  }),

  forfeit: z.object({
    gameId: gameIdSchema
  })
};

// Helper function to validate and parse data
export function validateSocketData<T extends keyof typeof schemas>(
  eventName: T,
  data: unknown
): { success: true; data: any } | { success: false; error: string } {
  const schema = schemas[eventName];
  const result = schema.safeParse(data) as any;

  if (result.success) {
    return { success: true, data: result.data };
  } else {
    const errors = result.error.errors.map((err: any) => `${err.path.join('.')}: ${err.message}`).join(', ');
    return { success: false, error: `Invalid input: ${errors}` };
  }
}
