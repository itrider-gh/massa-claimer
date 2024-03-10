const { WalletClient, ClientFactory, CHAIN_ID, Args, MassaUnits, fromMAS } = require('@massalabs/massa-web3');
const SC_ADDRESS = 'AS12qzyNBDnwqq2vYwvUMHzrtMkVp6nQGJJ3TETVKF5HCd4yymzJP';

async function claimAllVestingSessions(accountAddress, privateKey, claimAmount, fee) {
    try {
        const feeMAS = fromMAS(fee);
        // Check if the fee exceeds the threshold
        if (feeMAS > fromMAS('0.1')) {
            console.log(`Warning: The transaction fee is set to ${fee} MAS and exceed 0.1 MAS, which is considered high.`);
            console.log('Usage: node script.js <accountAddress> <privateKey> <claimAmount> <fee>');
            console.log('Please adjust it to a lower value.');
            process.exit(1);
        }

        // Initialize the client to interact with the Massa network
        const client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true);

        // Fetch datastore keys associated with the smart contract address
        const addrInfo = await client.publicApiClient.getAddresses([SC_ADDRESS]);
        const allKeys = addrInfo[0].candidate_datastore_keys;

        let sessionIds = [];

        // Filter keys to extract vesting session IDs
        for (let key of allKeys) {
            const deser = new Args(key);
            const keyTagNumber = Number(deser.nextU8());

            // Check tags to identify vesting session keys
            if (keyTagNumber === 2 || keyTagNumber === 3) {
                const keyAddress = deser.nextString();
                if (keyAddress === accountAddress) {
                    const sessionId = deser.nextU64().toString();
                    if (!sessionIds.includes(sessionId)) {
                        sessionIds.push(sessionId);
                    }
                }
            }
        }

        if (sessionIds.length === 0) {
            console.log('No vesting sessions found for this address.');
            return;
        }

        // Use private key to create a base account
        const baseAccount = await WalletClient.getAccountFromSecretKey(privateKey);

        // Create a client for making smart contract calls
        const web3Client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true);

        // Attempt to claim the specified amount for each found session ID
        for (let sessionId of sessionIds) {
            const serializedArgs = new Args().addU64(BigInt(sessionId)).addU64(BigInt(fromMAS(claimAmount))).serialize();

            // Call the smart contract function to claim the amount
            const opId = await web3Client.smartContracts().callSmartContract({
                targetAddress: SC_ADDRESS,
                functionName: 'claimVestingSession',
                parameter: serializedArgs,
                maxGas: BigInt(4800754),
                coins: BigInt(0),
                fee: feeMAS,
            });

            console.log(`Session ID: ${sessionId}, Operation ID of the smart contract call: ${opId}`);
        }
    } catch (error) {
        console.error('Error while attempting to claim vesting sessions:', error);
    }
}

// Ensure necessary arguments are provided
if (!process.argv[2] || !process.argv[3] || !process.argv[4] || !process.argv[5]) {
    console.log('Usage: node script.js <accountAddress> <privateKey> <claimAmount> <fee>');
    process.exit(1);
}

// Retrieve command line arguments for account address, private key, claim amount, and fee
const accountAddress = process.argv[2];
const privateKey = process.argv[3];
const claimAmount = process.argv[4];
const fee = process.argv[5];

// Invoke the main function with parameters
claimAllVestingSessions(accountAddress, privateKey, claimAmount, fee);
