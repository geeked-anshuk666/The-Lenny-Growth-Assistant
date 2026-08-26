# Contributing to The Lenny Growth Assistant

Thank you for considering contributing to **The Lenny Growth Assistant**! We welcome bug reports, feature suggestions, and pull requests.

## Code of Conduct

Please adhere to respectful and collaborative communication. Keep pull requests focused and well-documented.

## Getting Started

1. **Fork the Repository** to your own GitHub account.
2. **Clone your fork**:
   ```bash
   git clone https://github.com/your-username/The-Lenny-Growth-Assistant.git
   cd The-Lenny-Growth-Assistant
   ```
3. **Set up Environment**:
   ```bash
   cp .env.example .env
   ```

## Development & Testing

- **Backend Tests**: Run `pytest tests/ -v` inside the `api/` directory.
- **Linting & Types**: Ensure TypeScript code in `frontend/` and `agent-service/` compiles cleanly (`npm run build` or `npx tsc --noEmit`).

## Pull Request Guidelines

1. Create a feature branch (`git checkout -b feature/my-new-feature`).
2. Keep commits clear and atomic with descriptive commit messages.
3. Ensure all automated tests pass before submitting your PR.
4. Submit a Pull Request targeting the `main` branch.
