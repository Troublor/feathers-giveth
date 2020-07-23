/* eslint-disable import/no-extraneous-dependencies */
const Web3 = require('web3');
const { Kernel, ACL, LPVault, LiquidPledging, LPFactory, test } = require('giveth-liquidpledging');
const { LPPCampaign, LPPCampaignFactory } = require('lpp-campaign');
const { BridgedMilestone, LPMilestone, MilestoneFactory } = require('lpp-milestones');
const { MiniMeTokenFactory, MiniMeToken, MiniMeTokenState } = require('minimetoken');
const { GivethBridge, ForeignGivethBridge } = require('giveth-bridge');
const startNetworks = require('./startNetworks');
const HDWalletProvider = require('@truffle/hdwallet-provider');

const { RecoveryVault } = test;

// NOTE: do not use the bridge account (account[10]) for any txs outside of the bridge
// if you do, the nonce will become off and the bridge will fail

async function deploy() {
  try {
    // const { homeNetwork, foreignNetwork } = await startNetworks();
    //
    // await homeNetwork.waitForStart();
    // await foreignNetwork.waitForStart();
    //
    // const homeWeb3 = new Web3('http://localhost:8545');
    // const foreignWeb3 = new Web3('http://localhost:8546');

    const mnemonic = 'myth like bonus scare over problem client lizard pioneer submit female collect';
    const provider = new HDWalletProvider(mnemonic, 'http://localhost:8545', 0, 11, false);
    const homeWeb3 = new Web3(provider);
    const foreignProvider = new HDWalletProvider(mnemonic, 'http://localhost:8546', 0, 11, false);
    const foreignWeb3 = new Web3(foreignProvider);

    // const accounts = ['0x90F8bf6A479f320ead074411a4B0e7944Ea8c9C1',
    //   '0xFFcf8FDEE72ac11b5c542428B35EEF5769C409f0',
    //   '0x22d491Bde2303f2f43325b2108D26f1eAbA1e32b',
    //   '0xE11BA2b4D45Eaed5996Cd0823791E0C93114882d',
    //   '0xd03ea8624C8C5987235048901fB614fDcA89b117',
    //   '0x95cED938F7991cd0dFcb48F0a06a40FA1aF46EBC',
    //   '0x3E5e9111Ae8eB78Fe1CC3bb8915d5D461F3Ef9A9',
    //   '0x28a8746e75304c0780E011BEd21C72cD78cd535E',
    //   '0xACa94ef8bD5ffEE41947b4585a84BdA5a3d3DA6E',
    //   '0x1dF62f291b2E969fB0849d99D9Ce41e2F137006e',
    //   '0x610Bb1573d1046FCb8A70Bbbd395754cD57C2b60'];
    // const homeAccounts = accounts;

    const accounts = await foreignWeb3.eth.getAccounts();
    const homeAccounts = await homeWeb3.eth.getAccounts();

    const from = accounts[0];

    const baseVault = await LPVault.new(foreignWeb3);
    const baseLP = await LiquidPledging.new(foreignWeb3);
    const lpFactory = await LPFactory.new(foreignWeb3, baseVault.$address, baseLP.$address, {
      gas: 6700000,
    });
    const recoveryVault = (await RecoveryVault.new(foreignWeb3)).$address;
    const r = await lpFactory.newLP(from, recoveryVault, { $extraGas: 100000 });

    const vaultAddress = r.events.DeployVault.returnValues.vault;
    const vault = new LPVault(foreignWeb3, vaultAddress);

    const lpAddress = r.events.DeployLiquidPledging.returnValues.liquidPledging;
    const liquidPledging = new LiquidPledging(foreignWeb3, lpAddress);

    // set permissions
    const kernel = new Kernel(foreignWeb3, await liquidPledging.kernel());
    const acl = new ACL(foreignWeb3, await kernel.acl());
    await acl.createPermission(
      accounts[0],
      vault.$address,
      await vault.CANCEL_PAYMENT_ROLE(),
      accounts[0],
      { $extraGas: 200000 },
    );
    await acl.createPermission(
      accounts[0],
      vault.$address,
      await vault.CONFIRM_PAYMENT_ROLE(),
      accounts[0],
      { $extraGas: 200000 },
    );
    await acl.createPermission(
      accounts[0],
      vault.$address,
      await vault.SET_AUTOPAY_ROLE(),
      accounts[0],
      { $extraGas: 200000 },
    );
    await vault.setAutopay(true, { from: accounts[0], $extraGas: 100000 });

    // deploy campaign plugin
    const tokenFactory = await MiniMeTokenFactory.new(foreignWeb3);
    const lppCampaignFactory = await LPPCampaignFactory.new(foreignWeb3, kernel.$address, {
      $extraGas: 100000,
    });
    await acl.grantPermission(
      lppCampaignFactory.$address,
      acl.$address,
      await acl.CREATE_PERMISSIONS_ROLE(),
      {
        $extraGas: 100000,
      },
    );
    await acl.grantPermission(
      lppCampaignFactory.$address,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      { $extraGas: 100000 },
    );

    const campaignApp = await LPPCampaign.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await lppCampaignFactory.CAMPAIGN_APP_ID(),
      campaignApp.$address,
      { $extraGas: 100000 },
    );

    // deploy MilestoneFactory

    const milestoneFactory = await MilestoneFactory.new(foreignWeb3, kernel.$address, {
      $extraGas: 100000,
    });
    await acl.grantPermission(
      milestoneFactory.$address,
      acl.$address,
      await acl.CREATE_PERMISSIONS_ROLE(),
      {
        $extraGas: 100000,
      },
    );
    await acl.grantPermission(
      milestoneFactory.$address,
      kernel.$address,
      await kernel.APP_MANAGER_ROLE(),
      { $extraGas: 100000 },
    );
    await acl.grantPermission(
      milestoneFactory.$address,
      liquidPledging.$address,
      await liquidPledging.PLUGIN_MANAGER_ROLE(),
      { $extraGas: 100000 },
    );

    // deploy LPMilestone plugin

    const lpMilestoneApp = await LPMilestone.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.LP_MILESTONE_APP_ID(),
      lpMilestoneApp.$address,
      { $extraGas: 100000 },
    );

    // deploy BridgedMilestone plugin

    const bridgedMilestoneApp = await BridgedMilestone.new(foreignWeb3);
    await kernel.setApp(
      await kernel.APP_BASES_NAMESPACE(),
      await milestoneFactory.BRIDGED_MILESTONE_APP_ID(),
      bridgedMilestoneApp.$address,
      { $extraGas: 100000 },
    );

    // deploy bridges
    const foreignBridge = await ForeignGivethBridge.new(
      foreignWeb3,
      accounts[10],
      accounts[10],
      tokenFactory.$address,
      liquidPledging.$address,
      accounts[10],
      [],
      [],
      { from: accounts[10], $extraGas: 100000 },
    );

    await kernel.setApp(
      await kernel.APP_ADDR_NAMESPACE(),
      foreignWeb3.utils.keccak256('ForeignGivethBridge'),
      foreignBridge.$address,
      { $extraGas: 100000 },
    );

    const fiveDays = 60 * 60 * 24 * 5;
    const homeBridge = await GivethBridge.new(
      homeWeb3,
      accounts[10],
      accounts[10],
      60 * 60 * 25,
      60 * 60 * 48,
      accounts[10],
      fiveDays,
      { from: accounts[10], $extraGas: 100000 },
    );

    await homeBridge.authorizeSpender(accounts[10], true, { from: accounts[10] });

    // deploy tokens
    await foreignBridge.addToken(
      '0x0000000000000000000000000000000000000000',
      'Foreign ETH',
      18,
      'FETH',
      { from: accounts[10] },
    );
    const foreignEthAddress = await foreignBridge.tokenMapping(
      '0x0000000000000000000000000000000000000000',
    );

    // deploy ERC20 test token
    const miniMeToken = await MiniMeToken.new(
      homeWeb3,
      tokenFactory.$address,
      '0x0000000000000000000000000000000000000000',
      '0x0000000000000000000000000000000000000000',
      'MiniMe Test Token',
      18,
      'MMT',
      true,
    );

    // generate tokens for all home accounts
    // we first generate all tokens, then transfer, otherwise MetaMask will not show token balances
    await miniMeToken.generateTokens(homeAccounts[10], Web3.utils.toWei('100000'), { from: homeAccounts[0] });

    // transfer tokens to all other home accounts, so that Meta mask will detect these tokens
    await Promise.all(
      homeAccounts.map(
        async a =>
          await miniMeToken.transfer(a, Web3.utils.toWei('10000'), { from: homeAccounts[10], gas: 1000000 }),
      ),
    );

    const miniMeTokenState = new MiniMeTokenState(miniMeToken);
    const st = await miniMeTokenState.getState();
    homeAccounts.map(a =>
      console.log('MMT balance of address ', a, ' > ', Web3.utils.fromWei(st.balances[a])),
    );

    // whitelist MMT token
    await homeBridge.whitelistToken(miniMeToken.$address, true, { from: accounts[10] });

    // add token on foreign
    await foreignBridge.addToken(miniMeToken.$address, 'MiniMe Test Token', 18, 'MMT', {
      from: accounts[10],
    });
    const foreigTokenAddress = await foreignBridge.tokenMapping(miniMeToken.$address);

    console.log('\n\n', {
      vault: vault.$address,
      liquidPledging: liquidPledging.$address,
      lppCampaignFactory: lppCampaignFactory.$address,
      milestoneFactory: milestoneFactory.$address,
      givethBridge: homeBridge.$address,
      foreignGivethBridge: foreignBridge.$address,
      homeEthToken: foreignEthAddress,
      miniMeToken: {
        name: 'MiniMe Token',
        address: miniMeToken.$address,
        foreignAddress: foreigTokenAddress,
        symbol: 'MMT',
        decimals: 18,
      },
    });

    if (vault.$address !== '0x6098441760E4614AAc6e6bb3Ec7A254C2a600b5d' ||
      liquidPledging.$address !== '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592' ||
      lppCampaignFactory.$address !== '0x9b1f7F645351AF3631a656421eD2e40f2802E6c0' ||
      milestoneFactory.$address !== '0x630589690929E9cdEFDeF0734717a9eF3Ec7Fcfe' ||
      homeBridge.$address !== '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8' ||
      foreignBridge.$address !== '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8' ||
      foreignEthAddress !== '0x5a42ca500aB159c51312B764bb25C135026e7a31' ||
      miniMeToken.$address !== '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab' ||
      foreigTokenAddress !== '0x8F086f895deBc23473dfe507dd4BF35D6184552c') {
      console.error('Contract address not compatible');
    }
    /*
     { vault: '0x6098441760E4614AAc6e6bb3Ec7A254C2a600b5d',
  liquidPledging: '0xBeFdf675cb73813952C5A9E4B84ea8B866DBA592',
  lppCampaignFactory: '0x9b1f7F645351AF3631a656421eD2e40f2802E6c0',
  milestoneFactory: '0x630589690929E9cdEFDeF0734717a9eF3Ec7Fcfe',
  givethBridge: '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8',
  foreignGivethBridge: '0x8fed3F9126e7051DeA6c530920cb0BAE5ffa17a8',
  homeEthToken: '0x5a42ca500aB159c51312B764bb25C135026e7a31',
  miniMeToken:
   { name: 'MiniMe Token',
     address: '0xe78A0F7E598Cc8b0Bb87894B0F60dD2a88d6a8Ab',
     foreignAddress: '0x8F086f895deBc23473dfe507dd4BF35D6184552c',
     symbol: 'MMT',
     decimals: 18 } }
     */
    process.exit(); // some reason, this script won't exit. I think it has to do with web3 subscribing to tx confirmations?
  } catch (e) {
    console.log(e);
    process.exit();
  }
}

deploy();
