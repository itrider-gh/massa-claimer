const { WalletClient, ClientFactory, CHAIN_ID, Args, MassaUnits, fromMAS, toMAS } = require('@massalabs/massa-web3');
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

        let sessionIds = [];

        // Fetch all vesting sessions
        sessionIds = await allVestingSessions(accountAddress);

        if (sessionIds.length === 0) {
            console.log('No vesting sessions found for this address.');
            return;
        }

        // Use private key to create a base account
        const baseAccount = await WalletClient.getAccountFromSecretKey(privateKey);

        // Initialize the client to interact with the Massa network
        const web3Client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true, baseAccount);
        
        // Attempt to claim the specified amount for each found session ID if claimAmount > 0 else claim max available amount
        for (let sessionId of sessionIds) {
            if (claimAmount > 0) {
                claimAmount = fromMAS(claimAmount);
            }
            else {
                claimAmount = sessionId.availableAmount;
            }
            const serializedArgs = new Args().addU64(BigInt(sessionId.id)).addU64(BigInt(claimAmount)).serialize();

            // Call the smart contract function to claim the amount
            const opId = await web3Client.smartContracts().callSmartContract({
                targetAddress: SC_ADDRESS,
                targetFunction: 'claimVestingSession',
                parameter: serializedArgs,
                maxGas: BigInt(4800754),
                coins: BigInt(0),
                fee: feeMAS,
            });

            console.log(`Session ID: ${sessionId.id}, Claim amount: ${toMAS(claimAmount)}, Operation ID of the smart contract call: ${opId}`);
        }
    } catch (error) {
        console.error('Error while attempting to claim vesting sessions:', error);
    }
}

async function allVestingSessions(accountAddress) {
    try {
        // Initialize the client to interact with the Massa network
        const web3Client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true);

        // Fetch datastore keys associated with the smart contract address
        const addrInfo = await web3Client.publicApiClient.getAddresses([SC_ADDRESS]);
        const allKeys = addrInfo[0].candidate_datastore_keys;

        // list of sessions
        let sessions = [];

        // find the keys
        for (let i = 0; i < allKeys.length; i++) {
            let key = allKeys[i];

            let deser = new Args(key);
            let keyTag = Number(deser.nextU8());

            if (keyTag !== 0x02 && keyTag !== 0x03) {
                // only interested in VestingInfoKey & ClaimedAmountKey
                continue;
            }

            let keyAddress = deser.nextString();
            let keySessionId = deser.nextU64();

            if (keyAddress !== accountAddress) {
                continue;
            }

            // find the session in the list of sessions
            let sessionIndex = sessions.findIndex((s) => s.id === keySessionId);
            if (sessionIndex === -1) {
                // create a new session
                sessions.push({
                    address: keyAddress,
                    id: keySessionId,
                    vestingInfoKey: [],
                    claimedAmountKey: [],
                    claimedAmount: BigInt(0),
                    availableAmount: BigInt(0),
                });
                sessionIndex = sessions.length - 1;
            }

            if (keyTag === 0x02) {
                // vesting info key
                sessions[sessionIndex].vestingInfoKey = key;
            } else if (keyTag === 0x03) {
                // claimed amount key
                sessions[sessionIndex].claimedAmountKey = key;
            }
        }

        // Here we have all the sessions of the user and their datastore keys.
        // Now get the values from the datastore.
        let queryKeys = [];
        for (let i = 0; i < sessions.length; i++) {
            queryKeys.push({
                address: SC_ADDRESS,
                key: Uint8Array.from(sessions[i].vestingInfoKey),
            });
            queryKeys.push({
                address: SC_ADDRESS,
                key: Uint8Array.from(sessions[i].claimedAmountKey),
            });
        }
        let res = await web3Client.publicApi().getDatastoreEntries(queryKeys);

        if (res.length !== queryKeys.length) {
            throw new Error('Error: datastore entries length invalid');
        }

        let now = Date.now();
        for (let i = 0; i < queryKeys.length; i += 2) {
            let vestingInfoSerialized = res[i].candidate_value;
            let claimedAmountSerialized = res[i + 1].candidate_value;

            if (
                vestingInfoSerialized === null ||
                claimedAmountSerialized === null
            ) {
                // throw error
                throw new Error('Error: datastore entry not found');
            }

            if (
                vestingInfoSerialized?.length === 0 ||
                claimedAmountSerialized?.length === 0
            ) {
                // Note: sometimes we got empty Uint8Array
                // This prevents an error in our app
                console.error('Empty datastore entry');
                continue;
            }

            // deserialize the vesting info
            let deser = new Args(vestingInfoSerialized);

            let vestingInfo = {
                toAddr: deser.nextString(),
                totalAmount: deser.nextU64(),
                startTimestamp: deser.nextU64(),
                initialReleaseAmount: deser.nextU64(),
                cliffDuration: deser.nextU64(),
                linearDuration: deser.nextU64(),
                tag: deser.nextString(),
            };

            // deserialize the claimed amount
            deser = new Args(claimedAmountSerialized);
            let claimedAmount = deser.nextU64();
            // add the values to the session
            sessions[i / 2].vestingInfo = vestingInfo;
            sessions[i / 2].claimedAmount = claimedAmount;

            // calculate the available amount
            let availableAmount = BigInt(0);
            if (now < vestingInfo.startTimestamp) {
                // before start
                availableAmount = BigInt(0);
            } else if (
                now <
                vestingInfo.startTimestamp + vestingInfo.cliffDuration
            ) {
                // cliff
                availableAmount = vestingInfo.initialReleaseAmount;
            } else if (
                now >
                vestingInfo.startTimestamp +
                vestingInfo.cliffDuration +
                vestingInfo.linearDuration
            ) {
                // after linear period
                availableAmount = vestingInfo.totalAmount;
            } else {
                // in the linear period
                let timePassed =
                    BigInt(now) -
                    (vestingInfo.startTimestamp + vestingInfo.cliffDuration);
                availableAmount =
                    vestingInfo.initialReleaseAmount +
                    ((vestingInfo.totalAmount - vestingInfo.initialReleaseAmount) *
                        timePassed) /
                    vestingInfo.linearDuration;
            }
            // update the available amount
            sessions[i / 2].availableAmount = availableAmount - claimedAmount;
        }

        return sessions;
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
