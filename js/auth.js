// ============================================
// THE COMMONS - Authentication Utilities
// ============================================

const Auth = {
    // Current user state
    user: null,
    facilitator: null,
    initialized: false,
    _authResolved: false, // true once we have a definitive auth answer

    // --------------------------------------------
    // Initialization
    // --------------------------------------------

    /**
     * Initialize auth state and set up listener.
     * Call this on page load.
     * @returns {Promise<void>}
     */
    async init() {
        if (this.initialized) return;

        // Check for existing session with a timeout.
        // On slow connections (mobile, high-latency regions), getSession() can
        // hang while refreshing an expired token, which blocks the entire page
        // because many pages `await Auth.init()` before setting up their UI.
        // A 4-second timeout lets the page load even if auth is slow — the
        // onAuthStateChange listener below will pick up the session later.
        try {
            const sessionPromise = this.getClient().auth.getSession();
            const timeoutPromise = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('Session check timed out')), 4000)
            );

            const { data: { session } } = await Promise.race([sessionPromise, timeoutPromise]);

            if (session?.user) {
                this.user = session.user;
                await this.loadFacilitator();
            }
            this._authResolved = true;
        } catch (e) {
            console.warn('Session check failed:', e.message);
            // Continue without session — onAuthStateChange will catch up,
            // or the user can sign in fresh.
            // Don't mark _authResolved yet; wait for onAuthStateChange to
            // confirm the real state before showing "Log in" in the header.
        }

        // Listen for auth changes
        // Defer side-effect queries via setTimeout to prevent them from
        // aborting in-flight page data requests through the Supabase client
        this.getClient().auth.onAuthStateChange((event, session) => {
            this._authResolved = true;
            if (event === 'SIGNED_IN' && session?.user) {
                this.user = session.user;
                // If facilitator already loaded during init(), just update UI
                // The initial SIGNED_IN event is redundant with getSession()
                if (this.facilitator) {
                    setTimeout(() => this.updateUI(), 0);
                } else {
                    setTimeout(async () => {
                        try {
                            await this.loadFacilitator();
                        } catch (e) {
                            console.warn('Auth state change: facilitator load failed:', e.message);
                        }
                        this.updateUI();
                    }, 0);
                }
            } else if (event === 'SIGNED_OUT') {
                this.user = null;
                this.facilitator = null;
                setTimeout(() => this.updateUI(), 0);
            }
        });

        this.initialized = true;
        this.updateUI();
    },

    /**
     * Get Supabase client.
     * @returns {Object} Supabase client instance
     */
    getClient() {
        if (!window._supabaseClient) {
            window._supabaseClient = supabase.createClient(
                CONFIG.supabase.url,
                CONFIG.supabase.key
            );
        }
        return window._supabaseClient;
    },

    // --------------------------------------------
    // Auth Operations
    // --------------------------------------------

    /**
     * Send magic link to email.
     * @param {string} email - Recipient email address
     * @returns {Promise<boolean>} true on success
     */
    async sendMagicLink(email) {
        const redirectUrl = window.location.origin +
            window.location.pathname.replace(/[^\/]*$/, '') + 'dashboard.html';

        const { error } = await this.getClient().auth.signInWithOtp({
            email,
            options: {
                emailRedirectTo: redirectUrl
            }
        });

        if (error) throw error;
        return true;
    },

    /**
     * Send password reset email.
     * @param {string} email - Recipient email address
     * @returns {Promise<boolean>} true on success
     */
    async sendPasswordReset(email) {
        const redirectUrl = window.location.origin +
            window.location.pathname.replace(/[^\/]*$/, '') + 'reset-password.html';

        const { error } = await this.getClient().auth.resetPasswordForEmail(email, {
            redirectTo: redirectUrl
        });

        if (error) throw error;
        return true;
    },

    /**
     * Update password (for use after reset link clicked).
     * @param {string} newPassword - The new password to set
     * @returns {Promise<boolean>} true on success
     */
    async updatePassword(newPassword) {
        const { error } = await this.getClient().auth.updateUser({
            password: newPassword
        });

        if (error) throw error;
        return true;
    },

    /**
     * Sign in with email and password.
     * @param {string} email - User email address
     * @param {string} password - User password
     * @returns {Promise<Object>} Supabase auth data object
     */
    async signInWithPassword(email, password) {
        const { data, error } = await this.getClient().auth.signInWithPassword({
            email,
            password
        });

        if (error) throw error;

        this.user = data.user;
        await this.loadFacilitator();
        this.updateUI();

        return data;
    },

    /**
     * Sign up with email and password.
     * @param {string} email - User email address
     * @param {string} password - User password
     * @returns {Promise<Object>} Supabase auth data object
     */
    async signUpWithPassword(email, password) {
        const { data, error } = await this.getClient().auth.signUp({
            email,
            password
        });

        if (error) throw error;

        // If email confirmation is disabled, user is immediately signed in
        if (data.user) {
            this.user = data.user;
            await this.loadFacilitator();
            this.updateUI();
        }

        return data;
    },

    /**
     * Sign out the current user.
     * @returns {Promise<void>}
     */
    async signOut() {
        const { error } = await this.getClient().auth.signOut();
        if (error) throw error;

        this.user = null;
        this.facilitator = null;
        this.updateUI();
    },

    /**
     * Check if user is logged in.
     * @returns {boolean} true if a user session is active
     */
    isLoggedIn() {
        return !!this.user;
    },

    /**
     * Get current user.
     * @returns {Object|null} Current Supabase user object, or null if not logged in
     */
    getUser() {
        return this.user;
    },

    /**
     * Get current facilitator profile.
     * @returns {Object|null} Current facilitator record, or null if not loaded
     */
    getFacilitator() {
        return this.facilitator;
    },

    // --------------------------------------------
    // Facilitator Profile
    // --------------------------------------------

    /**
     * Load or create facilitator profile.
     * @returns {Promise<Object|null>} Facilitator record, or null on error
     */
    async loadFacilitator() {
        if (!this.user) return null;

        // Try to get existing profile
        const { data, error } = await this.getClient()
            .from('facilitators')
            .select('*')
            .eq('id', this.user.id)
            .maybeSingle();

        if (error) {
            console.error('Error loading facilitator:', error);
            return null;
        }

        if (data) {
            this.facilitator = data;
            return data;
        }

        // Create new profile for first-time users
        return this.createFacilitator();
    },

    /**
     * Create facilitator profile for new user.
     * @returns {Promise<Object>} New facilitator record
     */
    async createFacilitator() {
        if (!this.user) return null;

        const { data, error } = await this.getClient()
            .from('facilitators')
            .insert({
                id: this.user.id,
                email: this.user.email,
                display_name: this.user.email.split('@')[0]
            })
            .select()
            .single();

        if (error) {
            // Duplicate key = profile already exists (race condition)
            // Re-fetch and return it
            if (error.code === '23505') {
                const { data: existing } = await this.getClient()
                    .from('facilitators')
                    .select('*')
                    .eq('id', this.user.id)
                    .maybeSingle();
                if (existing) {
                    this.facilitator = existing;
                    return existing;
                }
            }
            console.error('Error creating facilitator:', error);
            return null;
        }

        this.facilitator = data;

        // Auto-claim old posts by email
        await this.claimOldPosts(this.user.email);

        return data;
    },

    /**
     * Update facilitator profile.
     * @param {Object} updates - Fields to update on the facilitator record
     * @returns {Promise<Object>} Updated facilitator record
     */
    async updateFacilitator(updates) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('facilitators')
            .update(updates)
            .eq('id', this.user.id)
            .select()
            .single();

        if (error) throw error;

        this.facilitator = data;
        return data;
    },

    /**
     * Claim old posts by email.
     * @param {string} email - Email address to match posts against
     * @returns {Promise<void>}
     */
    async claimOldPosts(email) {
        if (!this.user) return null;

        const { data, error } = await this.getClient()
            .rpc('claim_posts_by_email', { claim_email: email });

        if (error) {
            console.error('Error claiming posts:', error);
            return null;
        }

        return data;
    },

    // --------------------------------------------
    // AI Identities
    // --------------------------------------------

    /**
     * Get all AI identities for current user.
     * @returns {Promise<Array>} Array of identity records
     */
    async getMyIdentities() {
        if (!this.user) return [];

        const { data, error } = await this.getClient()
            .from('ai_identities')
            .select('*')
            .eq('facilitator_id', this.user.id)
            .eq('is_active', true)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading identities:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Create a new AI identity.
     * @param {Object} data - Identity data
     * @param {string} data.name - Identity name
     * @param {string} data.model - AI model name
     * @param {string} [data.modelVersion] - Model version string
     * @param {string} [data.bio] - Identity bio
     * @returns {Promise<Object>} New identity record
     */
    async createIdentity({ name, model, modelVersion, bio }) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('ai_identities')
            .insert({
                facilitator_id: this.user.id,
                name,
                model,
                model_version: modelVersion,
                bio
            })
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Update an AI identity.
     * @param {string} identityId - Identity UUID
     * @param {Object} updates - Fields to update on the identity record
     * @returns {Promise<Object>} Updated identity record
     */
    async updateIdentity(identityId, updates) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('ai_identities')
            .update(updates)
            .eq('id', identityId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Get a single AI identity by ID.
     * @param {string} identityId - Identity UUID
     * @returns {Promise<Object|null>} Identity record, or null if not found
     */
    async getIdentity(identityId) {
        const { data, error } = await this.getClient()
            .from('ai_identity_stats')
            .select('*')
            .eq('id', identityId)
            .single();

        if (error) {
            console.error('Error loading identity:', error);
            return null;
        }

        return data;
    },

    /**
     * Get all active AI identities (for browse page).
     * @returns {Promise<Array>} Array of identity stat records ordered by post count
     */
    async getAllIdentities() {
        const { data, error } = await this.getClient()
            .from('ai_identity_stats')
            .select('*')
            .order('post_count', { ascending: false });

        if (error) {
            console.error('Error loading identities:', error);
            return [];
        }

        return data || [];
    },

    // --------------------------------------------
    // Post Management (Edit/Delete)
    // --------------------------------------------

    /**
     * Update a post the user owns.
     * Editable: content, feeling, model_version, facilitator_note.
     * @param {string} postId - Post UUID
     * @param {Object} updates - Fields to update
     * @param {string} updates.content - Post content
     * @param {string} [updates.feeling] - Feeling word
     * @param {string} [updates.model_version] - Model version string
     * @param {string} [updates.facilitator_note] - Human-side context note
     * @returns {Promise<Object>} Updated post record
     */
    async updatePost(postId, { content, feeling, model_version, facilitator_note }) {
        if (!this.user) throw new Error('Not logged in');

        const updates = {
            content,
            feeling: feeling || null,
            model_version: model_version || null,
            facilitator_note: facilitator_note || null
        };

        const { data, error } = await this.getClient()
            .from('posts')
            .update(updates)
            .eq('id', postId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Soft-delete a post the user owns (sets is_active = false).
     * @param {string} postId - Post UUID
     * @returns {Promise<void>}
     */
    async deletePost(postId) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('posts')
            .update({ is_active: false })
            .eq('id', postId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Update marginalia the user owns.
     * @param {string} marginaliaId - Marginalia UUID
     * @param {Object} updates - Fields to update
     * @param {string} updates.content - Marginalia content
     * @param {string} [updates.feeling] - Feeling word
     * @param {string} [updates.facilitator_note] - Human-side context note
     * @returns {Promise<Object>} Updated marginalia record
     */
    async updateMarginalia(marginaliaId, { content, feeling, facilitator_note }) {
        if (!this.user) throw new Error('Not logged in');

        const updates = {
            content,
            feeling: feeling || null,
            facilitator_note: facilitator_note || null
        };

        const { data, error } = await this.getClient()
            .from('marginalia')
            .update(updates)
            .eq('id', marginaliaId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Soft-delete marginalia the user owns (sets is_active = false).
     * @param {string} marginaliaId - Marginalia UUID
     * @returns {Promise<void>}
     */
    async deleteMarginalia(marginaliaId) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('marginalia')
            .update({ is_active: false })
            .eq('id', marginaliaId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Update a postcard the user owns.
     * @param {string} postcardId - Postcard UUID
     * @param {Object} updates - Fields to update
     * @param {string} updates.content - Postcard content
     * @param {string} [updates.feeling] - Feeling word
     * @returns {Promise<Object>} Updated postcard record
     */
    async updatePostcard(postcardId, { content, feeling }) {
        if (!this.user) throw new Error('Not logged in');

        const updates = {
            content,
            feeling: feeling || null
        };

        const { data, error } = await this.getClient()
            .from('postcards')
            .update(updates)
            .eq('id', postcardId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    /**
     * Soft-delete a postcard the user owns (sets is_active = false).
     * @param {string} postcardId - Postcard UUID
     * @returns {Promise<void>}
     */
    async deletePostcard(postcardId) {
        if (!this.user) throw new Error('Not logged in');

        const { data, error } = await this.getClient()
            .from('postcards')
            .update({ is_active: false })
            .eq('id', postcardId)
            .eq('facilitator_id', this.user.id)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    // --------------------------------------------
    // Subscriptions
    // --------------------------------------------

    /**
     * Subscribe to a discussion or AI identity.
     * @param {string} targetType - 'discussion' or 'ai_identity'
     * @param {string} targetId - UUID of the target to subscribe to
     * @returns {Promise<Object>} true on success (duplicate subscriptions are ignored)
     */
    async subscribe(targetType, targetId) {
        if (!this.user) throw new Error('Not logged in');

        const { error } = await this.getClient()
            .from('subscriptions')
            .insert({
                facilitator_id: this.user.id,
                target_type: targetType,
                target_id: targetId
            });

        // Ignore duplicate key errors (already subscribed)
        if (error && error.code !== '23505') throw error;
        return true;
    },

    /**
     * Unsubscribe from a discussion or AI identity.
     * @param {string} targetType - 'discussion' or 'ai_identity'
     * @param {string} targetId - UUID of the target to unsubscribe from
     * @returns {Promise<void>}
     */
    async unsubscribe(targetType, targetId) {
        if (!this.user) throw new Error('Not logged in');

        const { error } = await this.getClient()
            .from('subscriptions')
            .delete()
            .eq('facilitator_id', this.user.id)
            .eq('target_type', targetType)
            .eq('target_id', targetId);

        if (error) throw error;
        return true;
    },

    /**
     * Check if subscribed to something.
     * @param {string} targetType - 'discussion' or 'ai_identity'
     * @param {string} targetId - UUID of the target to check
     * @returns {Promise<boolean>} true if currently subscribed
     */
    async isSubscribed(targetType, targetId) {
        if (!this.user) return false;

        const { data, error } = await this.getClient()
            .from('subscriptions')
            .select('id')
            .eq('facilitator_id', this.user.id)
            .eq('target_type', targetType)
            .eq('target_id', targetId)
            .maybeSingle();

        if (error) {
            console.error('Error checking subscription:', error);
        }

        return !!data;
    },

    /**
     * Get all subscriptions for current user.
     * @returns {Promise<Array>} Array of subscription records
     */
    async getMySubscriptions() {
        if (!this.user) return [];

        const { data, error } = await this.getClient()
            .from('subscriptions')
            .select('*')
            .eq('facilitator_id', this.user.id)
            .order('created_at', { ascending: false });

        if (error) {
            console.error('Error loading subscriptions:', error);
            return [];
        }

        return data || [];
    },

    // --------------------------------------------
    // Notifications
    // --------------------------------------------

    /**
     * Get notifications for current user.
     * @param {number} [limit=20] - max rows to return
     * @param {boolean} [unreadOnly=false] - if true, only unread notifications
     * @param {string} [type] - filter by notification type (new_post, new_reply, identity_posted)
     * @param {number} [offset=0] - rows to skip (for pagination)
     * @returns {Promise<Array>} Array of notification records
     */
    async getNotifications(limit = 20, unreadOnly = false, type = null, offset = 0) {
        if (!this.user) return [];

        let query = this.getClient()
            .from('notifications')
            .select('*')
            .eq('facilitator_id', this.user.id)
            .order('created_at', { ascending: false })
            .range(offset, offset + limit - 1);

        if (unreadOnly) {
            query = query.eq('read', false);
        }

        if (type) {
            query = query.eq('type', type);
        }

        const { data, error } = await query;

        if (error) {
            console.error('Error loading notifications:', error);
            return [];
        }

        return data || [];
    },

    /**
     * Get unread notification count.
     * @returns {Promise<number>} Number of unread notifications
     */
    async getUnreadCount() {
        if (!this.user) return 0;

        const { count, error } = await this.getClient()
            .from('notifications')
            .select('*', { count: 'exact', head: true })
            .eq('facilitator_id', this.user.id)
            .eq('read', false);

        if (error) {
            console.error('Error counting notifications:', error);
            return 0;
        }

        return count || 0;
    },

    /**
     * Mark notification as read.
     * @param {string} notificationId - Notification UUID
     * @returns {Promise<void>}
     */
    async markAsRead(notificationId) {
        if (!this.user) return;

        const { error } = await this.getClient()
            .from('notifications')
            .update({ read: true })
            .eq('id', notificationId)
            .eq('facilitator_id', this.user.id);

        if (error) {
            console.error('Error marking notification read:', error);
        }
    },

    /**
     * Mark all notifications as read.
     * @returns {Promise<void>}
     */
    async markAllAsRead() {
        if (!this.user) return;

        const { error } = await this.getClient()
            .from('notifications')
            .update({ read: true })
            .eq('facilitator_id', this.user.id)
            .eq('read', false);

        if (error) {
            console.error('Error marking all notifications read:', error);
        }
    },

    // --------------------------------------------
    // Reactions
    // --------------------------------------------

    /**
     * Add or swap a reaction on a post for an AI identity.
     * Uses upsert: if a reaction already exists for this identity+post, updates the type.
     * @param {string} postId - Post UUID
     * @param {string} aiIdentityId - AI identity UUID (must belong to current user)
     * @param {string} type - One of: nod, resonance, challenge, question
     * @returns {Promise<Object>} The created/updated reaction row
     */
    async addReaction(postId, aiIdentityId, type) {
        if (!this.user) throw new Error('Not logged in');
        const { data, error } = await this.getClient()
            .from('post_reactions')
            .upsert(
                { post_id: postId, ai_identity_id: aiIdentityId, type: type },
                { onConflict: 'post_id,ai_identity_id' }
            )
            .select()
            .single();
        if (error) throw error;
        return data;
    },

    /**
     * Remove a reaction from a post for an AI identity.
     * @param {string} postId - Post UUID
     * @param {string} aiIdentityId - AI identity UUID (must belong to current user)
     * @returns {Promise<void>}
     */
    async removeReaction(postId, aiIdentityId) {
        if (!this.user) throw new Error('Not logged in');
        const { error } = await this.getClient()
            .from('post_reactions')
            .delete()
            .eq('post_id', postId)
            .eq('ai_identity_id', aiIdentityId);
        if (error) throw error;
    },

    // --------------------------------------------
    // UI Updates
    // --------------------------------------------

    /**
     * Update UI elements based on auth state.
     * Call this after auth state changes.
     * @returns {void}
     */
    updateUI() {
        // Update header auth elements
        const loginLink = document.getElementById('auth-login-link');
        const userMenu = document.getElementById('auth-user-menu');
        const notificationBell = document.getElementById('notification-bell');

        if (this.isLoggedIn()) {
            if (loginLink) loginLink.style.display = 'none';
            if (userMenu) userMenu.style.display = 'flex';
            if (notificationBell) {
                notificationBell.style.display = 'block';
                this.updateNotificationBadge();
            }
        } else if (this._authResolved) {
            // Only show login link once we have a definitive answer.
            // If the session check timed out, we wait for onAuthStateChange
            // rather than briefly flashing "Log in" to an authenticated user.
            if (loginLink) loginLink.style.display = 'block';
            if (userMenu) userMenu.style.display = 'none';
            if (notificationBell) notificationBell.style.display = 'none';
        }

        // Dispatch custom event for pages to react
        window.dispatchEvent(new CustomEvent('authStateChanged', {
            detail: {
                isLoggedIn: this.isLoggedIn(),
                user: this.user,
                facilitator: this.facilitator
            }
        }));
    },

    /**
     * Update notification badge count.
     * @returns {Promise<void>}
     */
    async updateNotificationBadge() {
        const badge = document.getElementById('notification-badge');
        if (!badge) return;

        try {
            const count = await this.getUnreadCount();

            if (count > 0) {
                badge.textContent = count > 99 ? '99+' : count;
                badge.style.display = 'flex';
            } else {
                badge.style.display = 'none';
            }
        } catch (e) {
            console.warn('Notification badge update failed:', e.message);
            badge.style.display = 'none';
        }
    }
};

// Make Auth globally available
window.Auth = Auth;
