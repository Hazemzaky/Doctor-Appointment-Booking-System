import validator from 'validator'
import bycrypt from 'bycrypt'
import userModel from '../models/user.models.js'
import jwt from 'jsonwebtoken'
import {v2 as cloudinary } from 'cloudinary'
import doctorModel from '../models/doctorModel.js'
import appointmentModel from '../models/appointmentModel.js'
import razorpay from 'razorpay'
// Api to register user 
const registerUser = async (req,res  )=> {
    try {
        const {name, email, password} = req.body
        if(!name || !password || !email) {
            
            return res.json({status:false,message:"missing Details"})
        }
        // validating email format
        if(!validator.isEmail(email)){
            return res.json({status:false,message:"missing Details"})
        }

        // validating strong password
        if (password.length<8) {
        
            return res.json({status:false,message:"password should be at least 8 characters long"})
        }

        // hashing user password
        const salt = await bycrypt.genSalt(10)
        const hashedPassword = await bycrypt.hash(password, salt)

        const userData = {
            name,
            email,
            password:hashedPassword
        }
        const newUser = new userModel (userData)
        const user = await newUser.save()

        const token =jwt.sign ({id:user._id}, process.env.JWT_SECRET)
        res.json({status:true,token})


        

    } catch (error) {
        console.log(error)
        res.json({success:false, message: error.message})
        
    }
}

//api for user login
const loginUser=async(req, res)=> {
    try {

        const {email,password} = req.body
        const user = await userModel.findOne({email})

        if (!user) {
            return res.json({status:false, message: 'user does not exist'})

        }

        const isMatch = await bycrypt.compare(password, user.password)

        if(isMatch) {
            const token = jwt.sign({id:user._id}, process.env.JWT_SECRET)
            res.json({success:true, token})
        } else {
            res.json({status:false, message: "invalid credentials" })
        }

    }catch (error) {
        console.log(error)
        res.json({status:false, message: error.message})

    }
}

//api to get user profile data
const getProfile =async (req, res) => {
    try {
        const {userId} = req.body
        const userData =await userModel.findById(userId).select('-password')
        res.json({sucess:true,userData})
    } catch (error) {
        console.log(error)
        res.json({status:false, message: error.message})
    }
}

// API TO UPDATE USER PROFILE 
const updateProfile = async (req, res) => {
    try {
        const {userId, name , phone , address , dob , gender} = req.body
        const imageFile =req.imageFile
        if (!name || !phone || !address || !dob || !gender) {
            return res.json({success:false,message:"Data Missing"})
            
        } 

        await userModel.findByIdAndUpdate(userId,{name, phone , address:JSON.parse(address),dob, gender})

        if (imageFile) {
            //upload image to cloudinary
            const imageUpload = await cloudinary.uploader.upload(imageFile.path, {resource_type: 'image'})
            const imageURL = imageUpload.secure_url

            await userModel.findByIdAndUpdate(userId,{image:imageURL})
            
        }
        ResizeObserver.JSON({success:true,message:"Profile Updated"})
      
    } catch (error) {
        console.log(error)
        res.json({status:false, message: error.message})
    }
}

const bookAppointment = async (req, res) => {
  try {
    const { userId, docId, slotDate, slotTime } = req.body;

    const docData = await doctorModel.findById(docId).select("available");

    if (!docData.available) {
      return res.json({ success: false, message: "Doctor not available" });
    }
    let slots_booked=docData.slots_booked 
     
    if (slots_booked[slotDate]) {
        if (slots_booked[slotDate].includes(slotTime)) {
            return res.json({success:false,message:'Slot not available'})
        } else {
            slots_booked[slotDate].push(slotTime)
        }
    } else {
        slots_booked[slotDate] = []
        slots_booked[slotDate].push(slotTime)
    }
    
    const userData = await userModel.findById(userId).select('-password')
    
    delete docData.slots_booked
    
    const appointmentData = {
        userId,
        docId,
        userData,
        docData,
        amount:docData.fees,
        slotTime,
        slotDate,
        date:Date.now()
    }
const newAppointment = new appointmentModel(appointmentData)
await newAppointment.save()

// save new slots data in docData
await doctorModel.findByIdAndUpdate(docId, {slots_booked})

res.json({success:true, message:'Appointment Booked'})

  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
// API to get user appointments for frontend my appointments page
const listAppointment = async (req, res) => {

    try {
        const { userId } = req.body
        const appointments = await appointmentModel.find({ userId })

        res.json({ success: true, appointments })

    } catch (error) {
        console.log(error)
        res.json({ success: false, message: error.message })
    }
}
const cancelAppointment = async (req, res) => {
  try {
    const { userId, appointmentId } = req.body;
    const appointmentData = await appointmentModel.findById(appointmentId);

    // verify appointment user
    if (appointmentData.userId !== userId) {
      return res.json({ success: false, message: "Unauthorized action" });
    }

    await appointmentModel.findByIdAndUpdate(appointmentId, {
      cancelled: true,
    });
    // releasing doctor slot

    const { docId, slotDate, slotTime } = appointmentData;

    const doctorData = await doctorModel.findById(docId);

    let slots_booked = doctorData.slots_booked;

    slots_booked[slotDate] = slots_booked[slotDate].filter(
      (e) => e !== slotTime
    );

    await doctorModel.findByIdAndUpdate(docId, { slots_booked });

    res.json({ success: true, message: "Appointment Cancelled" });
  } catch (error) {
    console.log(error);
    res.json({ success: false, message: error.message });
  }
};
// const razorpayInstance = new razorpay({
//     key_id: process.env.RAZORPAY_KEY_ID,
//     key_secret: process.env.RAZORPAY_KEY_SECRET
// });

// // API to Make Payment of Appointment Using Razorpay
// const paymentRazorpay = async (req, res) => {
//     const { appointmentId } = req.body;
//     const appointmentData = await appointmentModel.findById(appointmentId);

//     if (!appointmentData || appointmentData.cancelled) {
//         return res.json({ success: false, message: "Appointment Cancelled or not found" });
//     }

//     // Creating options for Razorpay payment
//     const options = {
//         amount: appointmentData.amount * 100,
//         currency: process.env.CURRENCY,
//         receipt: appointmentId,
//     };
// }
export {registerUser , loginUser , getProfile , updateProfile, bookAppointment,listAppointment,cancelAppointment}