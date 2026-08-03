import React from 'react';
import TextField from '@mui/material/TextField';
import FormControlLabel from '@mui/material/FormControlLabel';
import Checkbox from '@mui/material/Checkbox';
import Table from '@mui/material/Table';
import TableBody from '@mui/material/TableBody';
import TableCell from '@mui/material/TableCell';
import TableHead from '@mui/material/TableHead';
import TableRow from '@mui/material/TableRow';
import IconButton from '@mui/material/IconButton';
import Button from '@mui/material/Button';
import Tabs from '@mui/material/Tabs';
import Tab from '@mui/material/Tab';
import Box from '@mui/material/Box';
import { I18n } from '@iobroker/gui-components';

interface UserMapping {
    username: string;
    stateName: string;
}

interface SettingsProps {
    native: Record<string, any>;
    onChange: (attr: string, value: unknown) => void;
}

interface SettingsState {
    tab: number;
}

/** Settings component — connection and user mapping configuration. */
class Settings extends React.Component<SettingsProps, SettingsState> {
    /** @inheritdoc */
    constructor(props: SettingsProps) {
        super(props);
        this.state = { tab: 0 };
    }

    private getUsers(): UserMapping[] {
        return Array.isArray(this.props.native.users) ? this.props.native.users : [];
    }

    private updateUsers(users: UserMapping[]): void {
        this.props.onChange('users', users);
    }

    private addUser(): void {
        this.updateUsers([...this.getUsers(), { username: '', stateName: '' }]);
    }

    private removeUser(index: number): void {
        this.updateUsers(this.getUsers().filter((_, i) => i !== index));
    }

    private updateUser(index: number, field: keyof UserMapping, value: string): void {
        this.updateUsers(
            this.getUsers().map((u, i) => (i === index ? { ...u, [field]: value } : u)),
        );
    }

    private renderConnection(): React.JSX.Element {
        const { native, onChange } = this.props;
        return (
            <Box sx={{ p: 3 }}>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
                    <TextField
                        label={I18n.t('WLC Host')}
                        value={native.wlcHost || ''}
                        onChange={(e) => onChange('wlcHost', e.target.value)}
                        variant="outlined"
                        size="small"
                        placeholder="10.0.21.11"
                        sx={{ width: 280 }}
                    />
                    <TextField
                        label={I18n.t('Poll Interval')}
                        value={native.pollInterval ?? 30}
                        type="number"
                        onChange={(e) => onChange('pollInterval', parseInt(e.target.value) || 30)}
                        variant="outlined"
                        size="small"
                        slotProps={{ htmlInput: { min: 10, max: 300 } }}
                        helperText="10 – 300 s"
                        sx={{ width: 130 }}
                    />
                    <TextField
                        label={I18n.t('Absent threshold')}
                        value={native.absentThreshold ?? 2}
                        type="number"
                        onChange={(e) => onChange('absentThreshold', parseInt(e.target.value) || 2)}
                        variant="outlined"
                        size="small"
                        slotProps={{ htmlInput: { min: 1, max: 10 } }}
                        helperText={I18n.t('Polls until absent')}
                        sx={{ width: 160 }}
                    />
                </Box>
                <Box sx={{ display: 'flex', gap: 3, flexWrap: 'wrap', mb: 3 }}>
                    <TextField
                        label={I18n.t('WLC Username')}
                        value={native.wlcUser || ''}
                        onChange={(e) => onChange('wlcUser', e.target.value)}
                        variant="outlined"
                        size="small"
                        autoComplete="off"
                        sx={{ width: 280 }}
                    />
                    <TextField
                        label={I18n.t('WLC Password')}
                        value={native.wlcPassword || ''}
                        type="password"
                        onChange={(e) => onChange('wlcPassword', e.target.value)}
                        variant="outlined"
                        size="small"
                        autoComplete="new-password"
                        sx={{ width: 280 }}
                    />
                </Box>
                <FormControlLabel
                    sx={{ color: 'text.primary' }}
                    control={
                        <Checkbox
                            checked={native.ignoreSelfSignedCert !== false}
                            onChange={() =>
                                onChange('ignoreSelfSignedCert', !native.ignoreSelfSignedCert)
                            }
                            color="primary"
                        />
                    }
                    label={I18n.t('Ignore self-signed certificate')}
                />
            </Box>
        );
    }

    private renderUsers(): React.JSX.Element {
        const users = this.getUsers();
        return (
            <Box sx={{ p: 3 }}>
                <Box sx={{ maxWidth: 680 }}>
                    <Table size="small">
                        <TableHead>
                            <TableRow>
                                <TableCell>{I18n.t('802.1X Username')}</TableCell>
                                <TableCell>{I18n.t('State Name')}</TableCell>
                                <TableCell sx={{ width: 48 }} />
                            </TableRow>
                        </TableHead>
                        <TableBody>
                            {users.map((user, index) => (
                                <TableRow key={index}>
                                    <TableCell>
                                        <TextField
                                            value={user.username}
                                            onChange={(e) =>
                                                this.updateUser(index, 'username', e.target.value)
                                            }
                                            placeholder="leonie"
                                            variant="outlined"
                                            size="small"
                                            fullWidth
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <TextField
                                            value={user.stateName}
                                            onChange={(e) =>
                                                this.updateUser(index, 'stateName', e.target.value)
                                            }
                                            placeholder="leonie"
                                            variant="outlined"
                                            size="small"
                                            fullWidth
                                            helperText="→ presence.<name>"
                                        />
                                    </TableCell>
                                    <TableCell>
                                        <IconButton
                                            size="small"
                                            onClick={() => this.removeUser(index)}
                                        >
                                            ✕
                                        </IconButton>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Button
                        variant="outlined"
                        size="small"
                        color="primary"
                        sx={{ mt: 1.5 }}
                        onClick={() => this.addUser()}
                    >
                        + {I18n.t('Add user')}
                    </Button>
                </Box>
            </Box>
        );
    }

    /** @inheritdoc */
    render(): React.JSX.Element {
        return (
            <Box>
                <Tabs value={this.state.tab} onChange={(_e, v) => this.setState({ tab: v })}>
                    <Tab label={I18n.t('Connection')} />
                    <Tab label={I18n.t('User Mapping')} />
                </Tabs>
                {this.state.tab === 0 && this.renderConnection()}
                {this.state.tab === 1 && this.renderUsers()}
            </Box>
        );
    }
}

export default Settings;
