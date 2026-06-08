module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx'],
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: { jsx: 'react' } }],
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleNameMapper: {
    // stub out native modules that Jest can't load
    '^expo-speech$': '<rootDir>/__mocks__/expo-speech.js',
    '^expo-haptics$': '<rootDir>/__mocks__/expo-haptics.js',
  },
};
