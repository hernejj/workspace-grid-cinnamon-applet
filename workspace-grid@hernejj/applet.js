const St = imports.gi.St;
const Lang = imports.lang;
const Applet = imports.ui.applet;
const Clutter = imports.gi.Clutter;
const ModalDialog = imports.ui.modalDialog;
const Gio = imports.gi.Gio;
const Signals = imports.signals;
const GLib = imports.gi.GLib;
const Meta = imports.gi.Meta;
const Main = imports.ui.main;

let ncols = 2;
let nrows = 1;

function read_prefs() {
    let filePath = GLib.get_home_dir() + '/.workspace-grid.prefs';
    let file = Gio.file_new_for_path(filePath);
    if (file.query_exists(null)) {
        let [flag, str] = file.load_contents(null);
        if (flag) {
            let lines = str.toString().split("\n");
            if (lines.length < 2) return;
            let cols = parseInt(lines[0]);
            let rows = parseInt(lines[1]);
            
            if( isNaN(cols) || cols < 1 || cols > 6 ) return;
            if( isNaN(rows) || rows < 1 || rows > 6 ) return;
            ncols = cols;
            nrows = rows;
        }
    }
}

function write_prefs() {
    let filePath = GLib.get_home_dir() + '/.workspace-grid.prefs';
    let rowFile = Gio.file_new_for_path(filePath);
    let contents = ncols.toString() + "\n" + nrows.toString();
    rowFile.replace_contents(contents, null, false, 0, null);
}

function set_workspace_grid(cols, rows) {
    equalize_num_workspaces();
    global.screen.override_workspace_layout(Meta.ScreenCorner.TOPLEFT, false, rows, cols);
}

function equalize_num_workspaces() {
    let new_ws_count = nrows * ncols;
    let old_ws_count = global.screen.n_workspaces;
    
    if (new_ws_count > old_ws_count) {
        for (let i=old_ws_count; i<new_ws_count; i++)
            global.screen.append_new_workspace(false, global.get_current_time());
    }
    else if (new_ws_count < old_ws_count) {
        for (let i=old_ws_count; i>new_ws_count; i--) {
            let ws = global.screen.get_workspace_by_index( global.screen.n_workspaces-1 );
            global.screen.remove_workspace(ws, global.get_current_time());
        }
    }
}

function switchWorkspace(display, screen, window, binding) {
    let current_workspace_index = global.screen.get_active_workspace_index();

    if (binding.get_name() == 'switch-to-workspace-left')
        Main.wm.actionMoveWorkspaceLeft();
    else if (binding.get_name() == 'switch-to-workspace-right')
        Main.wm.actionMoveWorkspaceRight();
    else if (binding.get_name() == 'switch-to-workspace-up')
        Main.wm.actionMoveWorkspaceUp();
    else if (binding.get_name() == 'switch-to-workspace-down')
        Main.wm.actionMoveWorkspaceDown();
        
    if (current_workspace_index !== global.screen.get_active_workspace_index())
        Main.wm.showWorkspaceOSD();
}

function MyApplet(orientation, panel_height) {
    this._init(orientation, panel_height);
}

MyApplet.prototype = {
    __proto__: Applet.Applet.prototype,

    _init: function(orientation, panel_height) {
        Applet.Applet.prototype._init.call(this, orientation, panel_height);
        
        try {
            this.button = [];
            this.actor.set_style_class_name("workspace-switcher-box");
            read_prefs();
            this.rebuildWorkspaceSwitcher();
            this.onPanelEditModeChanged();
                        
            this.actor.connect('button-press-event', Lang.bind(this, this.onAppletClicked));
            this.actor.connect('scroll-event', Lang.bind(this,this.onAppletScrollWheel));
            global.screen.connect('notify::n-workspaces', Lang.bind(this, this.rebuildWorkspaceSwitcher));
            global.window_manager.connect('switch-workspace', Lang.bind(this, this.updateWorkspaceSwitcher));   
            global.settings.connect('changed::panel-edit-mode', Lang.bind(this, this.onPanelEditModeChanged));  
        }
        catch (e) {
            global.logError(e);
        }
    },
    
    on_applet_added_to_panel: function () {
        set_workspace_grid(ncols, nrows);
        Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(this, switchWorkspace));
        Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(this, switchWorkspace));
        Meta.keybindings_set_custom_handler('switch-to-workspace-left', Lang.bind(this, switchWorkspace));
        Meta.keybindings_set_custom_handler('switch-to-workspace-right', Lang.bind(this, switchWorkspace));
    },

    on_applet_removed_from_panel: function() {
        set_workspace_grid(-1, 1);
        Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-up', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
        Meta.keybindings_set_custom_handler('switch-to-workspace-down', Lang.bind(Main.wm, Main.wm._showWorkspaceSwitcher));
    },
    
    onAppletClicked: function(actor, event) {
        if ( event.get_button() == 3 ) {  // Catch right click only
            if (this._workspaceDialog == null) this._workspaceDialog = new WorkspaceDialog();
            this._workspaceDialog.open();
            this.rebuildWorkspaceSwitcher();
            return true;
        }
        return false;
    },
    
    onPanelEditModeChanged: function() {
        let reactive = !global.settings.get_boolean('panel-edit-mode');
        for (let i=0; i < this.button.length; ++i)
            this.button[i].reactive = reactive;            
    }, 
    
    onAppletScrollWheel: function(actor, event){
        var idx = global.screen.get_active_workspace_index();

        if (event.get_scroll_direction() == 0) idx--; 
        else if (event.get_scroll_direction() == 1) idx++;
        
        if(global.screen.get_workspace_by_index(idx) != null)
                global.screen.get_workspace_by_index(idx).activate(global.get_current_time());
    },

    onRowIndicatorClicked: function(actor, event) {
        if ( event.get_button() != 1 ) return false;
        
        let curws_idx = global.screen.get_active_workspace_index();
        let curws_row = Math.floor(curws_idx/ncols);
        let [x, y] = event.get_coords();
        let [wx, wy] = actor.get_transformed_position();
        let [w, h] = actor.get_size();
        y -= wy;

        let clicked_row = Math.floor(nrows*y/h);
        clicked_idx = (clicked_row * ncols) + (curws_idx % ncols);

        global.screen.get_workspace_by_index(clicked_idx).activate(global.get_current_time());        
        return true;
    },

    onWorkspaceButtonClicked: function(actor, event) {
        if ( event.get_button() != 1 ) return false;
        global.screen.get_workspace_by_index(actor.index).activate(global.get_current_time());
    },

    on_panel_height_changed: function() {
        this._scaleMode = global.settings.get_boolean('panel-scale-text-icons');
        this.rebuildWorkspaceSwitcher();
    },

    rebuildWorkspaceSwitcher: function() {
        this.actor.destroy_all_children();

        if (nrows > 1) {
            this.row_indicator = new St.DrawingArea({ reactive: true, style_class: 'workspace-row-indicator' });
            this.row_indicator.connect('repaint', Lang.bind(this, this.draw_row_indicator));
            this.row_indicator.connect('button-press-event', Lang.bind(this, this.onRowIndicatorClicked));
            this.actor.add(this.row_indicator);
        }

        this.button = [];
        for ( let i=0; i<global.screen.n_workspaces; ++i ) {
            this.button[i] = new St.Button({ name: 'workspaceButton', style_class: 'workspace-button', reactive: true });
            
            let text = (i+1).toString();
            let label = new St.Label({ text: text });
            this.button[i].set_child(label);
            this.actor.add(this.button[i]);
            this.button[i].index = i;
            
            if (this._scaleMode)
                this.button[i].set_width(this._panelHeight);
            
            this.button[i].connect('button-release-event', Lang.bind(this, this.onWorkspaceButtonClicked));
        }
        
        this.updateWorkspaceSwitcher();
    },

    updateWorkspaceSwitcher: function() {
        let nworks = this.button.length;
        let active_ws = global.screen.get_active_workspace_index();
        let active_row = Math.floor(active_ws/ncols);
        let low = (active_row)*ncols;
        let high = low + ncols;

        for (let i=0; i < nworks; ++i) {
            if (i >= low && i < high) this.button[i].show();
            else this.button[i].hide();
                
            if (i == active_ws) {
                this.button[i].get_child().set_text((i+1).toString());
                this.button[i].add_style_pseudo_class('outlined');
            }
            else {
                this.button[i].get_child().set_text((i+1).toString());
                this.button[i].remove_style_pseudo_class('outlined');
            }
        }
        
        if ( this.row_indicator )
            this.row_indicator.queue_repaint();
    },
    
    draw_row_indicator: function(area) {
        let [width, height] = area.get_surface_size();
        let themeNode = this.row_indicator.get_theme_node();
        let cr = area.get_context();

        let active_color = themeNode.get_color('-active-color');
        let inactive_color = themeNode.get_color('-inactive-color');

        let active = global.screen.get_active_workspace_index();
        let active_row = Math.floor(active/ncols);

        for ( let i=0; i < nrows; ++i ) {
            let y = (i+1)*height/(nrows+1);
            let endx = (width / 10) * 9
            cr.moveTo(0, y);
            cr.lineTo(endx, y);
            let color = active_row == i ? active_color : inactive_color;
            Clutter.cairo_set_source_color(cr, color);
            cr.setLineWidth(2.0);
            cr.stroke();
        }
    }
};

/* Workspace Switcher Options Dialog */
function WorkspaceDialog() {
    this._init();
}

WorkspaceDialog.prototype = {
    __proto__: ModalDialog.ModalDialog.prototype,

    _init: function() {
        ModalDialog.ModalDialog.prototype._init.call(this, { styleClass: 'workspace-dialog' });

        /* Column Stuff */
        let label = new St.Label({ style_class: 'workspace-dialog-label', text: 'Number of columns' });
        this.contentLayout.add(label, { y_align: St.Align.START });
        
        let entry = new St.Entry({ style_class: 'workspace-dialog-entry' });
        this._colEntry = entry.clutter_text;
        this.contentLayout.add(entry, { y_align: St.Align.START });
        this.setInitialKeyFocus(this._colEntry);
        this._colEntry.connect('key-press-event', Lang.bind(this, this._onKeyPress));

        /* Row stuff */
        label = new St.Label({ style_class: 'workspace-dialog-label', text: 'Number of rows' });
        this.contentLayout.add(label, { y_align: St.Align.START });

        entry = new St.Entry({ style_class: 'workspace-dialog-entry' });
        this._rowEntry = entry.clutter_text;
        this.contentLayout.add(entry, { y_align: St.Align.START });
        this._rowEntry.connect('key-press-event', Lang.bind(this, this._onKeyPress));
    },

    open: function() {
        this._colEntry.set_text(ncols.toString());
        this._rowEntry.set_text(nrows.toString());
        ModalDialog.ModalDialog.prototype.open.call(this);
    },

    _onKeyPress: function(actor, event) {
        let symbol = event.get_key_symbol();

        /* Enter: Commit changes to disk and to current workspace config */
        if (symbol == Clutter.Return || symbol == Clutter.KP_Enter) {
            let colnum = parseInt(this._colEntry.get_text());
            let rownum = parseInt(this._rowEntry.get_text());
            if ((colnum == ncols && rownum == nrows) ||
               isNaN(colnum) || colnum < 1 || colnum > 6 ||
               isNaN(rownum) || rownum < 1 || rownum > 6) {
                this.close();
                return true;
            } 

            ncols = colnum;
            nrows = rownum;
            set_workspace_grid(ncols, -1);
            write_prefs();    
            this.close();
            return true;
        }
        
        /* Esc: User closed without saving changes */
        else if (symbol == Clutter.Escape) {
            this.close();
            return true;
        }
        
        /* Tab/up/down: Switch fields*/
        else if (symbol == Clutter.Tab) {
            if ( actor == this._rowEntry ) global.stage.set_key_focus(this._workspaceEntry);
            else global.stage.set_key_focus(this._rowEntry);
            return true;
        }
        else if (symbol == Clutter.Up && actor == this._rowEntry) {
            global.stage.set_key_focus(this._workspaceEntry);
            return true;
        }
        else if (symbol == Clutter.Down && actor == this._workspaceEntry) {
            global.stage.set_key_focus(this._rowEntry);
            return true;
        }
        return false;
    }
};
Signals.addSignalMethods(WorkspaceDialog.prototype);

function main(metadata, orientation, panel_height) {  
    let myApplet = new MyApplet(orientation, panel_height);
    return myApplet;      
}
