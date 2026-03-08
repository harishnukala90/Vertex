/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { motion, AnimatePresence } from 'motion/react';
import { CharacterArchetype } from '../types';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface AvatarProps {
  isTalking: boolean;
  archetype: CharacterArchetype;
  className?: string;
}

export default function Avatar({ isTalking, archetype, className }: AvatarProps) {
  const isFriend = archetype === CharacterArchetype.FRIEND;
  
  return (
    <div className={cn("relative w-64 h-64 flex items-center justify-center", className)}>
      {/* 3D-ish Shadow */}
      <div className="absolute bottom-4 w-32 h-8 bg-black/20 blur-xl rounded-full" />
      
      {/* Character Body */}
      <motion.div
        animate={{
          y: [0, -10, 0],
          rotateY: isTalking ? [0, 5, -5, 0] : 0
        }}
        transition={{
          y: { duration: 4, repeat: Infinity, ease: "easeInOut" },
          rotateY: { duration: 0.5, repeat: isTalking ? Infinity : 0 }
        }}
        className="relative w-48 h-48 flex flex-col items-center"
      >
        {/* Head */}
        <motion.div 
          className={cn(
            "w-32 h-32 rounded-3xl shadow-2xl flex items-center justify-center relative overflow-hidden",
            isFriend ? "bg-gradient-to-br from-indigo-500 to-purple-600" : "bg-gradient-to-br from-emerald-500 to-teal-600"
          )}
        >
          {/* Eyes */}
          <div className="flex gap-8 mb-4">
            <motion.div 
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3 }}
              className="w-3 h-3 bg-white rounded-full" 
            />
            <motion.div 
              animate={{ scaleY: [1, 0.1, 1] }}
              transition={{ duration: 0.2, repeat: Infinity, repeatDelay: 3.1 }}
              className="w-3 h-3 bg-white rounded-full" 
            />
          </div>
          
          {/* Mouth */}
          <motion.div
            animate={isTalking ? {
              height: [4, 16, 4],
              width: [16, 24, 16],
              borderRadius: ["2px", "50%", "2px"]
            } : {
              height: 4,
              width: 16,
              borderRadius: "2px"
            }}
            transition={{ duration: 0.2, repeat: isTalking ? Infinity : 0 }}
            className="absolute bottom-8 bg-white/80"
          />

          {/* Archetype Indicator */}
          <div className="absolute top-2 right-2">
            <div className={cn(
              "w-2 h-2 rounded-full animate-pulse",
              isFriend ? "bg-pink-400" : "bg-yellow-400"
            )} />
          </div>
        </motion.div>

        {/* Neck/Shoulders */}
        <div className={cn(
          "w-12 h-8 -mt-2 rounded-b-xl",
          isFriend ? "bg-indigo-700" : "bg-emerald-700"
        )} />
      </motion.div>

      {/* Aura Effect */}
      <AnimatePresence>
        {isTalking && (
          <motion.div
            initial={{ scale: 0.8, opacity: 0 }}
            animate={{ scale: 1.2, opacity: 0.3 }}
            exit={{ scale: 1.5, opacity: 0 }}
            transition={{ duration: 1, repeat: Infinity }}
            className={cn(
              "absolute inset-0 rounded-full border-4",
              isFriend ? "border-indigo-400" : "border-emerald-400"
            )}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
