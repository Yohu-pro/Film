import { supabase } from '../supabaseClient';

export interface ValidationResult {
  success: boolean;
  error?: string;
  apiKey?: string;
  updatedCredit?: number;
}

/**
 * Validates user request before content generation according to business rules.
 * 
 * @param userId - The ID of the user (email or UUID)
 * @param deviceId - The unique ID of the device (for trial mode)
 * @param mode - The generation mode (admin, trial, pro, enterprise)
 * @param cost - The credit cost for the operation (for enterprise mode)
 * @param lang - The current display language ('EN' | 'VN')
 */
export async function validateUserRequest(
  userId: string,
  deviceId: string,
  mode: 'admin' | 'trial' | 'pro' | 'enterprise',
  cost: number = 1,
  lang: 'EN' | 'VN' = 'VN'
): Promise<ValidationResult> {
  try {
    // 1. Load user from public.users by id (UUID)
    const { data: user, error: userError } = await supabase
      .from('users')
      .select('*')
      .eq('id', userId)
      .single();

    if (userError || !user) {
      return { 
        success: false, 
        error: lang === 'VN' ? "Không tìm thấy người dùng." : "User not found." 
      };
    }

    // 2. Kiểm tra mode ngay lập tức - Admin là tầng cao nhất
    if (mode === 'admin') {
      // admin: Quyền tuyệt đối, Bỏ qua toàn bộ kiểm tra (expire, trial, credit, device_id)
      return { success: true };
    }

    // 3. Nếu không phải admin mới kiểm tra plan_expiry_date
    if (user.plan_expiry_date) {
      const now = new Date();
      const expiry = new Date(user.plan_expiry_date);
      
      if (expiry < now) {
        // Update plan_status = 'expired'
        await supabase
          .from('users')
          .update({ plan_status: 'expired' })
          .eq('id', userId);
        
        return { 
          success: false, 
          error: lang === 'VN' ? "Gói đã hết hạn." : "Plan has expired." 
        };
      }
    }

    // 4. Check plan_status
    if (user.plan_status === 'expired') {
      return { 
        success: false, 
        error: lang === 'VN' ? "Gói đã hết hạn." : "Plan has expired." 
      };
    }

    // 5. Handle remaining 3 modes: trial, pro, enterprise
    switch (mode) {
      case 'trial': {
        // trial: Mandatory device_id, Check trial_devices, No credit deduction
        if (!deviceId) {
          return { 
            success: false, 
            error: lang === 'VN' ? "Thiếu mã thiết bị." : "Missing device ID." 
          };
        }

        const { data: trialDevice } = await supabase
          .from('trial_devices')
          .select('*')
          .eq('device_id', deviceId)
          .single();

        if (trialDevice) {
          return { 
            success: false, 
            error: lang === 'VN' ? "Thiết bị này đã sử dụng gói dùng thử." : "This device has already used the trial plan." 
          };
        }

        // Insert device_id
        const { error: insertError } = await supabase
          .from('trial_devices')
          .insert([{ device_id: deviceId, user_id: userId }]);

        if (insertError) {
          return { 
            success: false, 
            error: lang === 'VN' ? "Lỗi khi đăng ký dùng thử." : "Error registering trial." 
          };
        }

        return { success: true };
      }

      case 'pro': {
        // pro: Unlimited, No credit deduction, No trial check, Must get API key from public.api_keys
        const { data: apiKeyData, error: apiKeyError } = await supabase
          .from('api_keys')
          .select('key')
          .eq('user_id', userId)
          .eq('is_active', true)
          .limit(1)
          .single();

        if (apiKeyError || !apiKeyData) {
          return { 
            success: false, 
            error: lang === 'VN' ? "Không tìm thấy API Key hợp lệ." : "No valid API Key found." 
          };
        }

        return { success: true, apiKey: apiKeyData.key };
      }

      case 'enterprise': {
        // enterprise: System API key, Unlimited times, Must deduct credit atomically
        const { data: updatedUser, error: updateError } = await supabase
          .from('users')
          .update({ credits: user.credits - cost })
          .eq('id', userId)
          .gte('credits', cost)
          .select('credits')
          .single();

        if (updateError || !updatedUser) {
          return { 
            success: false, 
            error: lang === 'VN' ? "Không đủ credit." : "Insufficient credits." 
          };
        }

        return { success: true, updatedCredit: updatedUser.credits };
      }

      default:
        return { 
          success: false, 
          error: lang === 'VN' ? "Chế độ không hợp lệ." : "Invalid mode." 
        };
    }
  } catch (error: any) {
    return { 
      success: false, 
      error: `${lang === 'VN' ? "Lỗi hệ thống" : "System error"}: ${error.message}` 
    };
  }
}
