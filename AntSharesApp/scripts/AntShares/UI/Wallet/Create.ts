﻿namespace AntShares.UI.Wallet
{
    export class Create extends TabBase
    {
        protected oncreate(): void
        {
            $(this.target).find("#create_wallet").click(this.OnCreateButtonClick);
            $(this.target).find("#delete_wallet").click(this.OnDeleteButtonClick);
        }

        private CurrentHeight: number;

        protected onload(): void
        {
            let rpc = new AntShares.Network.RPC.RpcClient("http://seed1.antshares.org:20332/");
            rpc.call("getblockcount", [], (height) => { this.CurrentHeight = height as number; })
        }

        private OnCreateButtonClick = () =>
        {
            if (formIsValid("form_create_wallet"))
            {
                let master = Wallets.Master.GetInstance();
                master.OpenDB(() =>
                {
                    master.GetWalletNameList(this.createWallet);
                });
            }
        }

        //删除当前所有钱包，测试用
        private OnDeleteButtonClick = () =>
        {
            console.clear();
            let master = Wallets.Master.GetInstance();
            master.OpenDB(() =>
            {
                master.GetWalletNameList(
                    (walletNameList: Array<string>) =>
                    {
                        if (walletNameList.length == 0)
                        {
                            alert("当前没有钱包数据库");
                        }
                        else
                        {
                            GlobalWallet.GetCurrentWallet().CloseDB();
                            for (let i = 0; i < walletNameList.length; i++)
                            {
                                this.deleteWallet(walletNameList[i]);
                                master.DeleteWalletName(walletNameList[i]);
                                alert("delete current wallet success.");
                            }
                        }
                    })
            });
        }

        private deleteWallet(waletName: string)
        {
            let wallet = new Wallets.Wallet();
            wallet.OpenDB(waletName, () =>
            {
                wallet.ClearObjectStore(StoreName.Key);
                wallet.ClearObjectStore(StoreName.Contract);
                wallet.ClearObjectStore(StoreName.Account);
                wallet.DeleteIndexdDB();
                wallet.CloseDB();
            });
        }

        private createWallet = (walletNameList: Array<string>) =>
        {
            let alreadyExitWallet = false;
            for (let i = 0; i < walletNameList.length; i++)
            {
                if (walletNameList[i] == $("#wallet_name").val())
                {
                    alreadyExitWallet = true;
                    break;
                }
            }
            if (alreadyExitWallet)
            {
                alert("已经存在重名的钱包文件，你可以打开钱包或者创建新的钱包。");
            }
            else
            {
                let wallet = GlobalWallet.GetCurrentWallet();
                wallet.dbName = $("#wallet_name").val();
                Wallets.Master.GetInstance().AddWalletName(new Wallets.WalletStore(wallet.dbName));
                wallet.OpenDB
                    (
                    $("#wallet_name").val(),
                    () =>
                    {
                        ToPasswordKey(toUint8Array($("#create_password").val()),
                            (passwordKey) =>
                            {
                                Wallets.Key.PasswordKey = passwordKey;
                                wallet.CreateWallet(passwordKey, this.createECDSAKey)
                            });
                    }
                    );

            }
        }

        private createECDSAKey = () =>
        {
            window.crypto.subtle.generateKey(
                { name: "ECDSA", namedCurve: "P-256" },
                true,
                ["sign", "verify"]
            )
                .then(p =>
                {
                    return window.crypto.subtle.exportKey("jwk", p.privateKey); //以jwk格式导出私钥
                }, err =>
                {
                    console.error(err);
                })
                .then(p =>
                {
                    Wallets.Account.PrivateKey = p.d.base64UrlDecode();
                    let publicKey = new Uint8Array(64);
                    publicKey.set(p.x.base64UrlDecode(), 0);
                    publicKey.set(p.y.base64UrlDecode(), 32);
                    Wallets.Account.PublicECPoint = Cryptography.ECPoint.fromUint8Array(publicKey, Cryptography.ECCurve.secp256r1);

                    Wallets.Account.PublicKey = Wallets.Account.PublicECPoint.encodePoint(false).subarray(1, 65);
                    let test = Wallets.Account.PublicECPoint.encodePoint(true);

                    ToScriptHash(Wallets.Account.PublicECPoint.encodePoint(true),
                        (publicKeyHash: Uint8Array) =>
                    {
                        Wallets.Account.PublicKeyHash = publicKeyHash;
                        GlobalWallet.GetCurrentWallet().EncriptPrivateKeyAndSave(
                            Wallets.Account.PrivateKey,
                            Wallets.Account.PublicKey,
                            publicKeyHash,
                            "我的账户",
                            this.createContract
                        );
                    });
                });
        }
        
        private createContract = () =>
        {
            let sc = new Wallets.SignatureContract(Wallets.Account.PublicECPoint);
            ToScriptHash(sc.RedeemScript, (ScriptHash: Uint8Array) =>
            {
                let contract = new ContractStore(ScriptHash, sc, sc.PublicKeyHash, "SignatureContract");
                let wallet = GlobalWallet.GetCurrentWallet();
                Wallets.Account.clear();
                wallet.AddContract(contract);
                wallet.AddKey(new Wallets.KeyStore("Height", this.CurrentHeight));

                wallet.LoadAccounts(() =>
                {
                    alert("创建钱包成功");
                    //打开成功后跳转账户管理页面
                    TabBase.showTab("#Tab_Account_Index");
                    let sync = new AntShares.UI.Sync();
                    sync.startSyncWallet();
                });
            })
        }

    }
}