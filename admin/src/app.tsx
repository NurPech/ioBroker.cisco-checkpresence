import React from 'react';
import { GenericApp, I18n } from '@iobroker/adapter-react-v5';
import type { GenericAppProps, GenericAppSettings } from '@iobroker/adapter-react-v5';
import Settings from './components/settings';

class App extends GenericApp {
    constructor(props: GenericAppProps) {
        const extendedProps: GenericAppSettings = {
            ...props,
            encryptedFields: ['wlcPassword'],
            translations: {
                en: require('./i18n/en.json'),
                de: require('./i18n/de.json'),
                ru: require('./i18n/ru.json'),
                pt: require('./i18n/pt.json'),
                nl: require('./i18n/nl.json'),
                fr: require('./i18n/fr.json'),
                it: require('./i18n/it.json'),
                es: require('./i18n/es.json'),
                pl: require('./i18n/pl.json'),
                'zh-cn': require('./i18n/zh-cn.json'),
            },
        };
        super(props, extendedProps);
    }

    onConnectionReady(): void {
        // executed when connection is ready
    }

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
