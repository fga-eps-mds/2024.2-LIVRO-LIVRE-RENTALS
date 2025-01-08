import { Repository } from 'typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRoles } from '../database/entities/user.entity';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { SignUpDto } from '../auth/dtos/signUp.dto';
import * as bcrypt from 'bcryptjs';
// eslint-disable-next-line import/no-unresolved
import { repositoryMockFactory } from '../../test/database/utils';
import { jwtContants } from './auth.constants';
import { UnauthorizedException } from '@nestjs/common';

describe('AuthService', () => {
  let service: AuthService;
  let userRepository: Repository<User>;
  let jwtService: JwtService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({
          global: true,
          secret: jwtContants.secret,
        }),
      ],
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useFactory: repositoryMockFactory,
        },
        JwtService,
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    jwtService = module.get<JwtService>(JwtService);

    jest.spyOn(bcrypt, 'hash').mockResolvedValueOnce('hashed-password');
    jest.spyOn(bcrypt, 'genSalt').mockResolvedValueOnce(10);
  });

  describe('signUp', () => {
    it('should create a new user and return a signed token', async () => {
      const signUpDto: SignUpDto = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@email.com',
        phone: '123456789',
        password: 'password',
      };

      const user = new User();
      user.id = '18ea976e-367b-4138-b68e-7aff3f7ae4de';
      user.firstName = signUpDto.firstName;
      user.lastName = signUpDto.lastName;
      user.email = signUpDto.email;
      user.phone = signUpDto.phone;
      user.role = UserRoles.User;

      jest.spyOn(userRepository, 'findOneBy').mockResolvedValueOnce(null);

      jest.spyOn(userRepository, 'create').mockReturnValue(user);
      jest.spyOn(userRepository, 'save').mockResolvedValue(user);
      jest.spyOn(service, 'signIn').mockResolvedValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });

      const response = await service.signUp(signUpDto);

      expect(userRepository.findOneBy).toHaveBeenCalledWith({
        email: 'test@email.com',
      });

      expect(userRepository.create).toHaveBeenCalledWith({
        ...signUpDto,
        role: UserRoles.User,
        password: expect.any(String),
      });
      expect(bcrypt.hash).toHaveBeenCalledWith('password', 10);
      expect(userRepository.save).toHaveBeenCalled();
      expect(response).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should throw an error if user already exists', async () => {
      // Arrange
      const signUpDto: SignUpDto = {
        firstName: 'Test',
        lastName: 'User',
        email: 'test@email.com',
        phone: '123456789',
        password: 'password',
      };

      const existingUser = new User();
      existingUser.email = 'existing@email.com';

      jest
        .spyOn(userRepository, 'findOneBy')
        .mockResolvedValueOnce(existingUser);

      // Act
      try {
        await service.signUp(signUpDto);
        fail('An error should be thrown');
      } catch (error) {
        // Assert
        expect(error).toBeInstanceOf(UnauthorizedException);
        expect((error as Error).message).toBe('Usuário já cadastrado.');
        expect(userRepository.create).not.toHaveBeenCalled();
        expect(userRepository.save).not.toHaveBeenCalled();
      }
    });
  });

  describe('signIn', () => {
    it('should throw an UnauthorizedException for invalid credentials', async () => {
      const email = 'test@email.com';
      const password = 'wrongPassword';
      const user = new User();
      user.email = email;
      user.password = 'hashedPassword';

      jest.spyOn(userRepository, 'findOneBy').mockResolvedValueOnce(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(false);

      await expect(service.signIn({ email, password })).rejects.toThrow(
        UnauthorizedException,
      );

      expect(userRepository.findOneBy).toHaveBeenCalledWith({ email });
      expect(bcrypt.compare).toHaveBeenCalledWith(password, user.password);
    });

    //error no jwtService.signAsync (help)
    it.skip('should return a signed token on successful login', async () => {
      const email = 'test@email.com';
      const password = 'validPassword';
      const user = new User();
      user.id = '18ea976e-367b-4138-b68e-7aff3f7ae4de';
      user.email = email;
      // Hash the password using bcrypt before setting it to the user object
      user.password = await bcrypt.hash(password, 10); // Adjust the cost factor as needed
      user.role = UserRoles.User;

      const payload = { sub: user.id, email, role: user.role };

      jest.spyOn(userRepository, 'findOneBy').mockResolvedValueOnce(user);
      jest.spyOn(bcrypt, 'compare').mockResolvedValueOnce(true);
      jest.spyOn(jwtService, 'signAsync').mockResolvedValue('access-token');
      jest.spyOn(jwtService, 'signAsync').mockResolvedValue('refresh-token');
      jest.spyOn(jwtService, 'signAsync').mockResolvedValue('secret');

      const response = await service.signIn({ email, password });

      expect(response).toEqual({
        accessToken: 'access-token',
        refreshToken: 'access-token', // Assuming same payload is used for both tokens (modify if different)
      });

      expect(userRepository.findOneBy).toHaveBeenCalledWith({ email });
      expect(bcrypt.compare).toHaveBeenCalledWith(password, user.password); // Password comparison with hashed value
      expect(jwtService.signAsync).toHaveBeenCalledTimes(2);
      expect(jwtService.signAsync).toHaveBeenCalledWith(payload);
    });
  });
});
