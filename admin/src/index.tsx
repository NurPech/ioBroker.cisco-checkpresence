import React from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, StyledEngineProvider } from '@mui/material/styles';
import { Utils, Theme } from '@iobroker/gui-components';
import type { ThemeName } from '@iobroker/gui-components';
import App from './app';

let themeName = Utils.getThemeName();

function build(): void {
    const container = document.getElementById('root');
    if (!container) {
        return;
    }
    const root = createRoot(container);
    root.render(
        <StyledEngineProvider injectFirst>
            <ThemeProvider theme={Theme(themeName)}>
                <App
                    adapterName="cisco-checkpresence"
                    onThemeChange={(_theme: ThemeName) => {
                        themeName = _theme;
                        build();
                    }}
                />
            </ThemeProvider>
        </StyledEngineProvider>,
    );
}

build();
