const { WalletClient, ClientFactory, SmartContractsClient, CHAIN_ID, Args, MassaUnits } = require('@massalabs/massa-web3');
const SC_ADDRESS = 'AS12qzyNBDnwqq2vYwvUMHzrtMkVp6nQGJJ3TETVKF5HCd4yymzJP';

// Récupération des arguments de la ligne de commande
const accountAddress = process.argv[2];
const privateKey = process.argv[3];

async function claimAllVestingSessions(accountAddress, privateKey) {
    try {
        // Initialisation du client pour interagir avec le réseau Massa
        const client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true);

        // Récupération des clés de datastore associées à l'adresse du smart contract
        const addrInfo = await client.publicApiClient.getAddresses([SC_ADDRESS]);
        const allKeys = addrInfo[0].candidate_datastore_keys;

        let sessionIds = [];

        // Filtrage des clés pour extraire les ID de sessions de vesting
        for (let key of allKeys) {
            const deser = new Args(key);
            const keyTagNumber = Number(deser.nextU8());

            // Vérification des tags pour identifier les clés de session de vesting
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
            console.log('Aucune session de vesting trouvée pour cette adresse.');
            return;
        }

        // Utilisation de la clé privée pour créer un compte de base
        const baseAccount = await WalletClient.getAccountFromSecretKey(privateKey);

        // Création d'un client pour effectuer des appels de smart contract
        const web3Client = await ClientFactory.createDefaultClient("https://mainnet.massa.net/api/v2", CHAIN_ID.MainNet, true);

        // Pour chaque session ID trouvé, tentative de réclamation du montant spécifié
        for (let sessionId of sessionIds) {
            const amountToClaim = BigInt(1n * MassaUnits.oneMassa); // Montant à réclamer exprimé en unité de Massa
            const serializedArgs = new Args().addU64(BigInt(sessionId)).addU64(amountToClaim).serialize();

            // Appel de la fonction du smart contract pour réclamer le montant
            const opId = await web3Client.smartContracts().callSmartContract({
                targetAddress: SC_ADDRESS,
                functionName: 'claimVestingSession',
                parameter: serializedArgs,
                maxGas: 4800754n,
                coins: 0n,
                fee: 1000000n,
            });

            console.log(`Session ID: ${sessionId}, ID de l'opération de l'appel du smart contract : ${opId}`);
        }
    } catch (error) {
        console.error('Erreur lors de la tentative de réclamation des sessions de vesting:', error);
    }
}

// Vérification de la présence des arguments nécessaires
if (!accountAddress || !privateKey) {
    console.log('Usage: node script.js <accountAddress> <privateKey>');
    process.exit(1);
}

// Appel de la fonction principale avec les paramètres
claimAllVestingSessions(accountAddress, privateKey);
