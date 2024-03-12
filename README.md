# Massa Claimer Script

This repository contains a Node.js script designed to claim all vesting sessions associated with a specific account address on the Massa blockchain. The script interfaces with the Massa blockchain through the `@massalabs/massa-web3` library, retrieving all vesting sessions for a given account and attempting to claim a specified amount from each session.

## Requirements

- Node.js (Version 14.x or higher recommended)
- `@massalabs/massa-web3` library

## Setup

1. Clone the repository from GitHub:

```
git clone https://github.com/itrider-gh/massa-claimer.git
```

2. Navigate into the cloned directory:

```
cd massa-claimer
```

3. Install the necessary Node.js packages:

```
npm install @massalabs/massa-web3
```

## Usage

The script requires four parameters to run:
- `accountAddress`: The Massa blockchain address of your account.
- `privateKey`: The private key of your account.
- `claimAmount`: The amount to be claimed from each vesting session, specified in Massa (MAS). *(0 to claim max available vesting amount)*
- `fee`: The transaction fee in Massa (MAS), to prioritize the transaction on the network.

Run the script using the command:

```
node massa-claimer.js <accountAddress> <privateKey> <claimAmount> <fee> 
```

### Example

1. Claim 100 MAS with 0.1 MAS fee

```
node massa-claimer.js A1EoSju2d35bQ48PgKz... S1fWyEJaFGAVhgH8rStFCasv... 100 0.1
```

2. Claim maximum available vesting amount with 0.1 MAS fee

```
node massa-claimer.js A1EoSju2d35bQ48PgKz... S1fWyEJaFGAVhgH8rStFCasv... 0 0.1
```

Replace placeholders with your actual account address, private key, claim amount, and desired fee.

## Security Note

- **Never share your private key with anyone or upload it to a public repository.**
- **Ensure your computer is secure when using this script to avoid exposing your private key.**

## Functionality

1. The script initializes a client to interact with the Massa network.
2. It fetches the datastore keys associated with the vesting smart contract.
3. Filters the keys to find vesting session IDs for the provided account address.
4. For each session ID, it attempts to claim the specified amount using the smart contract's `claimVestingSession` function.
5. Outputs the operation ID of the smart contract call for each session.

## Troubleshooting

- Ensure you're using the correct account address and private key.
- Verify your account has vesting sessions available to claim.
- Check if the specified fee and claim amount are appropriate and within your account's balance.

## Contributing

Feel free to fork the repository and submit pull requests to contribute to this project.

