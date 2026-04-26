import React from 'react';
import { GenericApp } from '@iobroker/adapter-react-v5';
import type { GenericAppProps, GenericAppSettings } from '@iobroker/adapter-react-v5';
import Settings from './components/settings';
import enI18n from './i18n/en.json';
import deI18n from './i18n/de.json';
import ruI18n from './i18n/ru.json';
import ptI18n from './i18n/pt.json';
import nlI18n from './i18n/nl.json';
import frI18n from './i18n/fr.json';
import itI18n from './i18n/it.json';
import esI18n from './i18n/es.json';
import plI18n from './i18n/pl.json';
import ukI18n from './i18n/uk.json';
import zhCnI18n from './i18n/zh-cn.json';

/** Root application component. */
class App extends GenericApp {
    /** @inheritdoc */
    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppSettings = {
            ...props,
            encryptedFields: ['wlcPassword'],
            translations: {
                en: enI18n,
                de: deI18n,
                ru: ruI18n,
                pt: ptI18n,
                nl: nlI18n,
                fr: frI18n,
                it: itI18n,
                es: esI18n,
                pl: plI18n,
                uk: ukI18n,
                'zh-cn': zhCnI18n,
            },
        };
        super(props, extendedProps);
    }

    /** @inheritdoc */
    onConnectionReady(): void {
        // executed when connection is ready
    }

    /** @inheritdoc */
    render(): React.JSX.Element {
        if (!this.state.loaded) {
            return super.render();
        }

        return (
            <div className="App">
                <Settings
                    native={this.state.native}
                    onChange={(attr: string, value: unknown) => this.updateNativeValue(attr, value)}
                />
                {this.renderError()}
                {this.renderToast()}
                {this.renderSaveCloseButtons()}
            </div>
        );
    }
}

export default App;
