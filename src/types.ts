/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export enum CharacterArchetype {
  FRIEND = 'Friend',
  TEACHER = 'Teacher'
}

export enum InteractionMode {
  PRIVATE = 'Private',
  GROUP = 'Group'
}

export enum AIModel {
  GEMINI_3_1_PRO = 'gemini-3.1-pro-preview',
  GEMINI_3_FLASH = 'gemini-3-flash-preview',
  GEMINI_2_5_FLASH = 'gemini-2.5-flash'
}

export interface Message {
  id: string;
  role: 'user' | 'model' | 'system';
  content: string;
  senderName: string;
  timestamp: number;
}

export interface AgentAction {
  name: string;
  args: any;
  status: 'pending' | 'completed' | 'failed';
}
