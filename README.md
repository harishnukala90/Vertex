# Vertex

This is a multimodal AI companion with Friend and Teacher archetypes, featuring voice interaction, agent capabilities, and social awareness.

## Local Setup

To run this project on your local machine:

1. **Prerequisites**: Ensure you have [Node.js](https://nodejs.org/) installed (v18 or higher recommended).
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run Development Server**:
   ```bash
   npm run dev
   ```
   The app will be available at `http://localhost:3000`.

## Configuration

- **API Key**: The Gemini API key is currently hardcoded in `src/services/geminiService.ts`. For production use, it is recommended to move this to an environment variable.
- **Styling**: Uses Tailwind CSS v4.
- **Animations**: Powered by `motion`.
- **Icons**: Uses `lucide-react`.

## Project Structure

- `src/App.tsx`: Main application logic and UI.
- `src/components/Avatar.tsx`: 3D-style avatar component.
- `src/services/geminiService.ts`: Integration with Google Gemini API.
- `src/types.ts`: TypeScript definitions.
